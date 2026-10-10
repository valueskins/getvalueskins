import {
  DISPUTE_ALREADY_RESOLVED,
  DISPUTE_NOT_ALLOWED,
  disputeAllowed,
  type DisputeCreateInput,
  type DisputeListQuery,
  type DisputeResolveInput,
} from '@valueskins/shared';
import { and, desc, eq, lt, type SQL } from 'drizzle-orm';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/types.js';
import type { ApiContext } from '../context.js';
import { db } from '../db/client.js';
import { deals, disputes, users } from '../db/schema/index.js';
import { decodeCursor, encodeCursor } from '../deals/cursor.js';
import { findDeal, notFound, parseId } from '../deals/access.js';
import { DELETED_USER_NAME } from '../deals/dealView.js';
import { emailOf } from '../email/recipients.js';
import { send } from '../email/send.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';
import { consumeDisputeLimit } from '../rateLimit/limiters.js';

type DisputeRow = typeof disputes.$inferSelect;

export interface DisputeView {
  id: string;
  dealId: string;
  dealShortId: string;
  dealTitle: string | null;
  subject: string;
  description: string;
  status: DisputeRow['status'];
  raisedBy: { id: string; username: string };
  resolution: string | null;
  refundReference: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface DisputeContext {
  dispute: DisputeRow;
  deal: typeof deals.$inferSelect;
  raisedByUsername: string;
  raisedByDeleted: boolean;
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
    },
    resolution: c.dispute.resolution,
    refundReference: c.dispute.refundReference,
    resolvedAt: c.dispute.resolvedAt?.toISOString() ?? null,
    createdAt: c.dispute.createdAt.toISOString(),
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

  await consumeDisputeLimit(`${user.id}:${deal.id}`, res);

  const [dispute] = await db
    .insert(disputes)
    .values({
      dealId: deal.id,
      raisedById: user.id,
      subject: input.subject,
      description: input.description,
    })
    .returning();
  if (!dispute) throw new Error('raiseDispute: insert returned no row');

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
  }

  return disputeView({
    dispute,
    deal,
    raisedByUsername: user.username,
    raisedByDeleted: false,
  });
}

/** GET /admin/disputes: newest first, optionally one status. */
export async function listDisputes(
  query: DisputeListQuery,
): Promise<{ items: DisputeView[]; nextCursor: string | null }> {
  const conditions: SQL[] = [];
  if (query.status) conditions.push(eq(disputes.status, query.status));
  if (query.cursor) {
    conditions.push(lt(disputes.id, decodeCursor(query.cursor, { needsTime: false }).i));
  }

  const rows = await db
    .select({
      dispute: disputes,
      deal: deals,
      username: users.username,
      deletedAt: users.deletedAt,
    })
    .from(disputes)
    .innerJoin(deals, eq(deals.id, disputes.dealId))
    .innerJoin(users, eq(users.id, disputes.raisedById))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(disputes.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) =>
      disputeView({
        dispute: r.dispute,
        deal: r.deal,
        raisedByUsername: r.username,
        raisedByDeleted: r.deletedAt !== null,
      }),
    ),
    nextCursor: rows.length > query.limit && last ? encodeCursor({ i: last.dispute.id }) : null,
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
    }
  }

  return disputeView({
    dispute: resolved,
    deal,
    raisedByUsername: raiser?.username ?? DELETED_USER_NAME,
    raisedByDeleted: raiser === undefined || raiser.deletedAt !== null,
  });
}
