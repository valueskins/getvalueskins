import {
  DISPUTE_ALREADY_OPEN,
  DISPUTE_ALREADY_RESOLVED,
  DISPUTE_NOT_ALLOWED,
  disputeAllowed,
  type DisputeCreateInput,
  type DisputeListQuery,
  type DisputeResolveInput,
  type AdminDisputeDetailResponse,
  type AdminDisputeListResponse,
  type DisputeView,
} from '@valueskins/shared';
import { and, count, desc, eq, lt, ne, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/types.js';
import type { ApiContext } from '../context.js';
import { db } from '../db/client.js';
import { isUniqueViolation } from '../db/pgErrors.js';
import { deals, disputes, users } from '../db/schema/index.js';
import { decodeCursor, encodeCursor } from '../deals/cursor.js';
import { findDeal, notFound, parseId } from '../deals/access.js';
import { DELETED_USER_NAME, iso, loadParties } from '../deals/dealView.js';
import { emailOf } from '../email/recipients.js';
import { send } from '../email/send.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';
import { captureError } from '../observability/sentry.js';
import { consumeDisputeLimit } from '../rateLimit/limiters.js';
import { emitDealUpdated } from '../realtime/events.js';

type DisputeRow = typeof disputes.$inferSelect;

interface DisputeContext {
  dispute: DisputeRow;
  deal: typeof deals.$inferSelect;
  raisedByUsername: string;
  raisedByDeleted: boolean;
  resolvedBy: { id: string | null; username: string; deleted: boolean } | null;
}

export function disputeView(c: DisputeContext): DisputeView {
  return {
    id: c.dispute.id,
    dealId: c.deal.id,
    dealShortId: c.deal.shortId,
    dealTitle: c.deal.title,
    subject: c.dispute.subject,
    description: c.dispute.description,
    status: c.dispute.status,
    raisedBy: {
      id: c.dispute.raisedById,
      username: c.raisedByDeleted ? DELETED_USER_NAME : c.raisedByUsername,
      role: c.dispute.raisedById === c.deal.brandId ? 'BRAND' : 'CREATOR',
    },
    resolution: c.dispute.resolution,
    refundReference: c.dispute.refundReference,
    resolvedBy:
      c.dispute.status === 'RESOLVED'
        ? {
            id: c.resolvedBy?.id ?? null,
            username:
              !c.resolvedBy || c.resolvedBy.deleted ? DELETED_USER_NAME : c.resolvedBy.username,
          }
        : null,
    resolvedAt: c.dispute.resolvedAt?.toISOString() ?? null,
    createdAt: c.dispute.createdAt.toISOString(),
  };
}

const resolver = alias(users, 'resolver');

/** A dispute with its deal, the person who raised it and the admin who resolved it. */
function selectDisputes() {
  return db
    .select({
      dispute: disputes,
      deal: deals,
      username: users.username,
      deletedAt: users.deletedAt,
      resolverId: resolver.id,
      resolverUsername: resolver.username,
      resolverDeletedAt: resolver.deletedAt,
    })
    .from(disputes)
    .innerJoin(deals, eq(deals.id, disputes.dealId))
    .innerJoin(users, eq(users.id, disputes.raisedById))
    .leftJoin(resolver, eq(resolver.id, disputes.resolvedById));
}

type DisputeRowWithParties = Awaited<ReturnType<typeof selectDisputes>>[number];

function viewOfRow(r: DisputeRowWithParties): DisputeView {
  return disputeView({
    dispute: r.dispute,
    deal: r.deal,
    raisedByUsername: r.username,
    raisedByDeleted: r.deletedAt !== null,
    resolvedBy:
      r.resolverId !== null
        ? {
            id: r.resolverId,
            username: r.resolverUsername ?? DELETED_USER_NAME,
            deleted: r.resolverDeletedAt !== null,
          }
        : null,
  });
}

/** Every dispute of one deal, newest first, as the admin sees them. */
export async function listDealDisputeViews(dealId: string): Promise<DisputeView[]> {
  const rows = await selectDisputes().where(eq(disputes.dealId, dealId)).orderBy(desc(disputes.id));
  return rows.map(viewOfRow);
}

/** One dispute, with who raised it and who resolved it. */
export async function getDispute(rawId: unknown): Promise<DisputeView> {
  const [row] = await selectDisputes()
    .where(eq(disputes.id, parseId(rawId)))
    .limit(1);
  if (!row) throw notFound();
  return viewOfRow(row);
}

/**
 * GET /admin/disputes/:id (SPEC 12): the dispute, the deal it is about (status, parties, amounts
 * and dates, enough for the dispute page), and the deal's other disputes.
 */
export async function getAdminDisputeDetail(rawId: unknown): Promise<AdminDisputeDetailResponse> {
  const [row] = await selectDisputes()
    .where(eq(disputes.id, parseId(rawId)))
    .limit(1);
  if (!row) throw notFound();
  const deal = row.deal;
  const parties = await loadParties(
    deal.creatorId ? [deal.brandId, deal.creatorId] : [deal.brandId],
  );
  const brand = parties.get(deal.brandId);
  if (!brand) throw new Error(`deal ${deal.id} has no brand row`);
  const others = await db
    .select({ id: disputes.id, subject: disputes.subject, status: disputes.status })
    .from(disputes)
    .where(and(eq(disputes.dealId, deal.id), ne(disputes.id, row.dispute.id)))
    .orderBy(desc(disputes.id));
  return {
    dispute: viewOfRow(row),
    deal: {
      id: deal.id,
      shortId: deal.shortId,
      title: deal.title,
      status: deal.status,
      brand,
      creator: deal.creatorId ? (parties.get(deal.creatorId) ?? null) : null,
      budgetPaise: deal.budgetPaise,
      commissionTotalPaise: deal.commissionTotalPaise,
      advancePaise: deal.advancePaise,
      finalPaise: deal.finalPaise,
      commissionPaidAt: iso(deal.commissionPaidAt),
      advancePaidAt: iso(deal.advancePaidAt),
      completedAt: iso(deal.completedAt),
      contentUploadDeadline: deal.contentUploadDeadline,
    },
    otherDisputes: others,
  };
}

/** Addresses of the deal's two parties that still exist; a deleted account has none. */
async function partyEmails(deal: { brandId: string; creatorId: string | null }): Promise<string[]> {
  const ids = deal.creatorId ? [deal.brandId, deal.creatorId] : [deal.brandId];
  const found = await Promise.all(ids.map((id) => emailOf(id)));
  return found.filter((e): e is string => e !== null);
}

/**
 * POST /deals/:id/disputes (SPEC 12). Only the deal's brand and its confirmed creator, once the
 * deal has a confirmed creator and is past OPEN. Email 15 goes to DISPUTE_EMAIL with both
 * parties in CC. The limit is consumed only after the request is valid and allowed.
 */
export async function raiseDispute(
  ctx: ApiContext,
  user: AuthenticatedUser,
  rawDealId: unknown,
  input: DisputeCreateInput,
  res: Response,
): Promise<DisputeView> {
  const deal = await findDeal(parseId(rawDealId));
  const isParty = deal !== null && (deal.brandId === user.id || deal.creatorId === user.id);
  if (!deal || !isParty) throw notFound();
  if (!disputeAllowed(deal.status, deal.creatorId !== null)) {
    throw new AppError('DISPUTE_NOT_ALLOWED', 409, DISPUTE_NOT_ALLOWED);
  }

  // One dispute at a time per deal. This is checked before the limit is used, so a refused
  // request costs nothing; the unique index below settles two raised at the same moment.
  const [open] = await db
    .select({ id: disputes.id })
    .from(disputes)
    .where(and(eq(disputes.dealId, deal.id), eq(disputes.status, 'OPEN')))
    .limit(1);
  if (open) throw new AppError('DISPUTE_ALREADY_OPEN', 409, DISPUTE_ALREADY_OPEN);

  await consumeDisputeLimit(`${user.id}:${deal.id}`, res);

  let dispute: DisputeRow | undefined;
  try {
    [dispute] = await db
      .insert(disputes)
      .values({
        dealId: deal.id,
        raisedById: user.id,
        subject: input.subject,
        description: input.description,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error))
      throw new AppError('DISPUTE_ALREADY_OPEN', 409, DISPUTE_ALREADY_OPEN);
    throw error;
  }
  if (!dispute) throw new Error('raiseDispute: insert returned no row');

  // The deal page of both parties now shows a dispute: refetch (SPEC 10).
  emitDealUpdated(deal);

  try {
    await send(
      'DISPUTE_RAISED',
      ctx.env.DISPUTE_EMAIL,
      {
        dealShortId: deal.shortId,
        dealTitle: deal.title ?? '',
        disputeSubject: input.subject,
        disputeDescription: input.description,
        raisedByUsername: user.username,
      },
      ctx.env,
      { cc: await partyEmails(deal), dealId: deal.id, userId: user.id },
    );
  } catch (error) {
    // The dispute is saved; a broken email must not fail the request.
    logger.error(
      { disputeId: dispute.id, error: error instanceof Error ? error.message : 'unknown' },
      'dispute email failed',
    );
    captureError(error, 'dispute email');
  }

  return disputeView({
    dispute,
    deal,
    raisedByUsername: user.username,
    raisedByDeleted: false,
    resolvedBy: null,
  });
}

/** GET /admin/disputes: newest first, optionally one status, with the total for that status. */
export async function listDisputes(query: DisputeListQuery): Promise<AdminDisputeListResponse> {
  const filters: SQL[] = [];
  if (query.status) filters.push(eq(disputes.status, query.status));
  const conditions = [...filters];
  if (query.cursor) {
    conditions.push(lt(disputes.id, decodeCursor(query.cursor, { needsTime: false }).i));
  }

  const [rows, [totalRow]] = await Promise.all([
    selectDisputes()
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(disputes.id))
      .limit(query.limit + 1),
    db
      .select({ value: count() })
      .from(disputes)
      .where(filters.length > 0 ? and(...filters) : undefined),
  ]);

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    items: page.map(viewOfRow),
    nextCursor: rows.length > query.limit && last ? encodeCursor({ i: last.dispute.id }) : null,
    total: totalRow?.value ?? 0,
  };
}

/**
 * POST /admin/disputes/:id/resolve (SPEC 12). Resolving records the note and the refund
 * reference; it does not change the deal. Both parties are emailed (15b). A second resolve
 * is a 409: the conditional update only matches an OPEN dispute.
 */
export async function resolveDispute(
  ctx: ApiContext,
  admin: AuthenticatedUser,
  rawId: unknown,
  input: DisputeResolveInput,
): Promise<DisputeView> {
  const id = parseId(rawId);
  const [resolved] = await db
    .update(disputes)
    .set({
      status: 'RESOLVED',
      resolution: input.resolution,
      refundReference: input.refundReference ?? null,
      resolvedById: admin.id,
      resolvedAt: ctx.now(),
    })
    .where(and(eq(disputes.id, id), eq(disputes.status, 'OPEN')))
    .returning();

  if (!resolved) {
    const [existing] = await db
      .select({ id: disputes.id })
      .from(disputes)
      .where(eq(disputes.id, id))
      .limit(1);
    if (!existing) throw notFound();
    throw new AppError('DISPUTE_ALREADY_RESOLVED', 409, DISPUTE_ALREADY_RESOLVED);
  }

  const deal = await findDeal(resolved.dealId);
  if (!deal) throw new Error(`dispute ${resolved.id} has no deal`);
  // The parties' deal pages show the dispute as resolved: refetch (SPEC 10).
  emitDealUpdated(deal);
  const [raiser] = await db
    .select({ username: users.username, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, resolved.raisedById))
    .limit(1);

  const recipients: { id: string }[] = [{ id: deal.brandId }];
  if (deal.creatorId) recipients.push({ id: deal.creatorId });
  for (const party of recipients) {
    try {
      const to = await emailOf(party.id);
      if (!to) continue;
      await send(
        'DISPUTE_RESOLVED',
        to,
        {
          dealShortId: deal.shortId,
          dealTitle: deal.title ?? '',
          disputeSubject: resolved.subject,
          resolution: input.resolution,
          refundReference: input.refundReference ?? null,
        },
        ctx.env,
        { dealId: deal.id, userId: party.id },
      );
    } catch (error) {
      logger.error(
        { disputeId: resolved.id, error: error instanceof Error ? error.message : 'unknown' },
        'dispute resolved email failed',
      );
      captureError(error, 'dispute resolved email');
    }
  }

  return disputeView({
    dispute: resolved,
    deal,
    raisedByUsername: raiser?.username ?? DELETED_USER_NAME,
    raisedByDeleted: raiser === undefined || raiser.deletedAt !== null,
    resolvedBy: { id: admin.id, username: admin.username, deleted: false },
  });
}
