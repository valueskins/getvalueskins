import {
  ADMIN_CANCEL_WINDOW,
  contentOverdue,
  type AdminCancelInput,
  type AdminDealListQuery,
  type DealStatus,
} from '@valueskins/shared';
import { and, asc, count, desc, eq, exists, like, lt, or, sql, type SQL } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/types.js';
import type { ApiContext } from '../context.js';
import { db } from '../db/client.js';
import {
  dealEvents,
  deals,
  directPayments,
  disputes,
  emailLog,
  invoices,
  payments,
  users,
} from '../db/schema/index.js';
import { findDeal, notFound, parseId } from '../deals/access.js';
import { buildDealDetail } from '../deals/dealDetail.js';
import { loadParties, toSummary } from '../deals/dealView.js';
import { eventColumns, toEventView } from '../deals/eventView.js';
import { decodeCursor, encodeCursor } from '../deals/cursor.js';
import { cancellationEmailTasks } from '../deals/lifecycle.service.js';
import { transitionDeal, type Deal } from '../deals/stateMachine.js';
import { listDealDisputeViews } from '../disputes/disputes.service.js';
import { listDirectPaymentRows, toDirectPaymentView } from '../directPayments/view.js';
import { AppError } from '../errors/AppError.js';

/** SPEC 5.2: the only statuses an admin can cancel from. Earlier stages are the brand's to cancel. */
const ADMIN_CANCELLABLE: readonly DealStatus[] = [
  'COMMISSION_PAID',
  'ADVANCE_PAID',
  'CONTENT_UPLOADED',
  'REVISION_REQUESTED',
  'APPROVED',
];

/** The emails shown on the detail view: the newest ones, the full history is GET /deals/:id/emails. */
const DETAIL_EMAIL_LIMIT = 200;

/** `%` and `_` are LIKE wildcards; a short id search is plain text. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * GET /admin/deals: newest first, optional status, short id search (prefix, case-insensitive).
 * Each item carries the marks the table shows: an open dispute, content past its deadline, and a
 * payment waiting for the creator. `total` counts every deal that matches the filters, not just
 * this page.
 */
export async function listAdminDeals(ctx: ApiContext, query: AdminDealListQuery) {
  const filters: SQL[] = [];
  if (query.status) filters.push(eq(deals.status, query.status));
  if (query.q) filters.push(like(deals.shortId, `${escapeLike(query.q.toUpperCase())}%`));
  const pageConditions = [...filters];
  if (query.cursor) {
    pageConditions.push(lt(deals.id, decodeCursor(query.cursor, { needsTime: false }).i));
  }

  // A recorded payment the creator has not confirmed or refused, for the stage the deal is due on.
  const awaitingRecord = db
    .select({ one: sql`1` })
    .from(directPayments)
    .where(
      and(
        eq(directPayments.dealId, deals.id),
        sql`${directPayments.confirmedAt} is null`,
        sql`${directPayments.disputedAt} is null`,
        or(
          and(eq(directPayments.stage, 'ADVANCE'), eq(deals.status, 'COMMISSION_PAID')),
          and(eq(directPayments.stage, 'FINAL'), eq(deals.status, 'APPROVED')),
        ),
      ),
    );
  const openDispute = db
    .select({ one: sql`1` })
    .from(disputes)
    .where(and(eq(disputes.dealId, deals.id), eq(disputes.status, 'OPEN')));

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        deal: deals,
        hasOpenDispute: exists(openDispute),
        awaitingConfirmation: exists(awaitingRecord),
      })
      .from(deals)
      .where(pageConditions.length > 0 ? and(...pageConditions) : undefined)
      .orderBy(desc(deals.id))
      .limit(query.limit + 1),
    db
      .select({ value: count() })
      .from(deals)
      .where(filters.length > 0 ? and(...filters) : undefined),
  ]);
  const now = ctx.now();

  const page = rows.slice(0, query.limit);
  const parties = await loadParties(
    page.flatMap(({ deal: d }) => (d.creatorId ? [d.brandId, d.creatorId] : [d.brandId])),
  );
  const last = page[page.length - 1];
  return {
    items: page.map(({ deal, hasOpenDispute, awaitingConfirmation }) => {
      const brand = parties.get(deal.brandId);
      if (!brand) throw new Error(`deal ${deal.id} has no brand row`);
      return {
        ...toSummary(deal, brand),
        creator: deal.creatorId ? (parties.get(deal.creatorId) ?? null) : null,
        hasOpenDispute,
        awaitingConfirmation,
        contentOverdue: contentOverdue(
          {
            status: deal.status,
            contentUploadDeadline: deal.contentUploadDeadline ?? '9999-12-31',
          },
          now,
        ),
        updatedAt: deal.updatedAt.toISOString(),
      };
    }),
    nextCursor: rows.length > query.limit && last ? encodeCursor({ i: last.deal.id }) : null,
    total: totalRow?.value ?? 0,
  };
}

/** GET /admin/deals/:id: the deal with everything an admin needs to act on it (SPEC 12). */
export async function getAdminDealDetail(
  ctx: ApiContext,
  admin: AuthenticatedUser,
  rawId: unknown,
) {
  const deal = await findDeal(parseId(rawId));
  if (!deal) throw notFound();

  const [detail, events, paymentRows, directPaymentRows, emailRows, disputeRows] =
    await Promise.all([
      buildDealDetail(deal, admin, ctx.now()),
      db
        .select(eventColumns)
        .from(dealEvents)
        .leftJoin(users, eq(users.id, dealEvents.actorId))
        .where(eq(dealEvents.dealId, deal.id))
        .orderBy(asc(dealEvents.id)),
      db
        .select({ payment: payments, invoiceNumber: invoices.number })
        .from(payments)
        .leftJoin(invoices, eq(invoices.paymentId, payments.id))
        .where(eq(payments.dealId, deal.id))
        .orderBy(asc(payments.id)),
      listDirectPaymentRows(deal.id),
      db
        .select()
        .from(emailLog)
        .where(eq(emailLog.dealId, deal.id))
        .orderBy(desc(emailLog.id))
        .limit(DETAIL_EMAIL_LIMIT),
      listDealDisputeViews(deal.id),
    ]);

  return {
    deal: detail,
    events: events.map((r) => toEventView(r, deal)),
    payments: paymentRows.map(({ payment: p, invoiceNumber }) => ({
      id: p.id,
      type: p.type,
      status: p.status,
      amountPaise: p.amountPaise,
      razorpayOrderId: p.razorpayOrderId,
      razorpayPaymentId: p.razorpayPaymentId,
      failureReason: p.failureReason,
      capturedAt: p.capturedAt?.toISOString() ?? null,
      razorpayFeePaise: p.razorpayFeePaise,
      razorpayTaxPaise: p.razorpayTaxPaise,
      invoiceNumber,
      createdAt: p.createdAt.toISOString(),
    })),
    directPayments: directPaymentRows.map(toDirectPaymentView),
    emails: emailRows.map((e) => ({
      id: e.id,
      template: e.template,
      subject: e.subject,
      bodyText: e.bodyText,
      toEmail: e.toEmail,
      cc: e.cc ?? [],
      status: e.status,
      error: e.error,
      attachmentNames: e.attachmentNames ?? [],
      createdAt: e.createdAt.toISOString(),
      sentAt: e.sentAt?.toISOString() ?? null,
    })),
    disputes: disputeRows,
  };
}

/**
 * POST /admin/deals/:id/cancel (SPEC 5.2, 12): the admin override from COMMISSION_PAID to APPROVED.
 * The note is the cancellation reason and the event's note; the optional refund reference is kept
 * in the deal event's metadata and shown as its own field. No money moves here: the advance and final were paid directly by
 * UPI outside ValueSkins, and the fee is refunded by hand in the Razorpay dashboard if at all.
 */
export async function adminCancelDeal(
  ctx: ApiContext,
  admin: AuthenticatedUser,
  rawId: unknown,
  input: AdminCancelInput,
): Promise<Deal> {
  const deal = await findDeal(parseId(rawId));
  if (!deal) throw notFound();
  if (!ADMIN_CANCELLABLE.includes(deal.status)) {
    throw new AppError('INVALID_TRANSITION', 409, ADMIN_CANCEL_WINDOW);
  }

  return transitionDeal({
    dealId: deal.id,
    from: deal.status,
    to: 'CANCELLED',
    actor: { role: 'ADMIN', id: admin.id },
    patch: {
      cancelledAt: ctx.now(),
      cancelledById: admin.id,
      cancelledByRole: 'ADMIN',
      cancellationReason: input.note,
    },
    // The refund reference is its own field on the event (metadata), not text in the note.
    note: input.note,
    metadata: { adminCancel: true, refundReference: input.refundReference ?? null },
    // The commission was paid before the advance, so it is always kept.
    afterCommit: cancellationEmailTasks(ctx, input.note, true),
  });
}
