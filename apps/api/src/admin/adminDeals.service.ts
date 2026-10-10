import type { AdminCancelInput, AdminDealListQuery, DealStatus } from '@valueskins/shared';
import { and, asc, desc, eq, like, lt, type SQL } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/types.js';
import type { ApiContext } from '../context.js';
import { db } from '../db/client.js';
import {
  dealEvents,
  deals,
  disputes,
  emailLog,
  invoices,
  payments,
  transfers,
  users,
} from '../db/schema/index.js';
import { findDeal, notFound, parseId } from '../deals/access.js';
import { buildDealDetail } from '../deals/dealDetail.js';
import { loadParties, toSummary } from '../deals/dealView.js';
import { decodeCursor, encodeCursor } from '../deals/cursor.js';
import { cancellationEmailTasks } from '../deals/lifecycle.service.js';
import { transitionDeal, type Deal } from '../deals/stateMachine.js';
import { disputeView } from '../disputes/disputes.service.js';
import { AppError } from '../errors/AppError.js';

/** SPEC 5.2: the only statuses an admin can cancel from. Earlier stages are the brand's to cancel. */
const ADMIN_CANCELLABLE: readonly DealStatus[] = [
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

/** GET /admin/deals: newest first, optional status, short id search (prefix, case-insensitive). */
export async function listAdminDeals(query: AdminDealListQuery) {
  const conditions: SQL[] = [];
  if (query.status) conditions.push(eq(deals.status, query.status));
  if (query.q) conditions.push(like(deals.shortId, `${escapeLike(query.q.toUpperCase())}%`));
  if (query.cursor) {
    conditions.push(lt(deals.id, decodeCursor(query.cursor, { needsTime: false }).i));
  }

  const rows = await db
    .select()
    .from(deals)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(deals.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const parties = await loadParties(
    page.flatMap((d) => (d.creatorId ? [d.brandId, d.creatorId] : [d.brandId])),
  );
  const last = page[page.length - 1];
  return {
    items: page.map((deal) => {
      const brand = parties.get(deal.brandId);
      if (!brand) throw new Error(`deal ${deal.id} has no brand row`);
      return {
        ...toSummary(deal, brand),
        creator: deal.creatorId ? (parties.get(deal.creatorId) ?? null) : null,
      };
    }),
    nextCursor: rows.length > query.limit && last ? encodeCursor({ i: last.id }) : null,
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

  const [detail, events, paymentRows, transferRows, emailRows, disputeRows] = await Promise.all([
    buildDealDetail(deal, admin, ctx.now()),
    db
      .select({ event: dealEvents, username: users.username })
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
    db.select().from(transfers).where(eq(transfers.dealId, deal.id)).orderBy(asc(transfers.id)),
    db
      .select()
      .from(emailLog)
      .where(eq(emailLog.dealId, deal.id))
      .orderBy(desc(emailLog.id))
      .limit(DETAIL_EMAIL_LIMIT),
    db
      .select({ dispute: disputes, username: users.username, deletedAt: users.deletedAt })
      .from(disputes)
      .innerJoin(users, eq(users.id, disputes.raisedById))
      .where(eq(disputes.dealId, deal.id))
      .orderBy(desc(disputes.id)),
  ]);

  return {
    deal: detail,
    events: events.map((r) => ({
      id: r.event.id,
      fromStatus: r.event.fromStatus,
      toStatus: r.event.toStatus,
      actorType: r.event.actorType,
      actorUsername: r.username,
      note: r.event.note,
      createdAt: r.event.createdAt.toISOString(),
    })),
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
    transfers: transferRows.map(transferView),
    emails: emailRows.map((e) => ({
      id: e.id,
      template: e.template,
      subject: e.subject,
      toEmail: e.toEmail,
      cc: e.cc ?? [],
      status: e.status,
      error: e.error,
      attachmentNames: e.attachmentNames ?? [],
      createdAt: e.createdAt.toISOString(),
      sentAt: e.sentAt?.toISOString() ?? null,
    })),
    disputes: disputeRows.map((r) =>
      disputeView({
        dispute: r.dispute,
        deal,
        raisedByUsername: r.username,
        raisedByDeleted: r.deletedAt !== null,
      }),
    ),
  };
}

export function transferView(t: typeof transfers.$inferSelect) {
  return {
    id: t.id,
    dealId: t.dealId,
    paymentId: t.paymentId,
    type: t.type,
    status: t.status,
    amountPaise: t.amountPaise,
    razorpayTransferId: t.razorpayTransferId,
    failureReason: t.failureReason,
    processedAt: t.processedAt?.toISOString() ?? null,
    razorpayFeePaise: t.razorpayFeePaise,
    razorpayTaxPaise: t.razorpayTaxPaise,
    manualReference: t.manualReference,
    manualAt: t.manualAt?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
  };
}

/**
 * POST /admin/deals/:id/cancel (SPEC 5.2, 12): the admin override from ADVANCE_PAID to APPROVED.
 * The note is the cancellation reason; the optional refund reference goes in the deal event
 * (its note and its metadata). No money moves here: refunds are done in the Razorpay dashboard.
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
    throw new AppError(
      'INVALID_TRANSITION',
      409,
      `An admin can cancel a deal from ADVANCE_PAID to APPROVED. This deal is ${deal.status}.`,
    );
  }

  const eventNote = input.refundReference
    ? `${input.note}\nRefund reference: ${input.refundReference}`
    : input.note;

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
    note: eventNote,
    metadata: { adminCancel: true, refundReference: input.refundReference ?? null },
    // The commission was paid before the advance, so it is always kept.
    afterCommit: cancellationEmailTasks(ctx, input.note, true),
  });
}
