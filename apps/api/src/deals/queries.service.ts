import {
  applicationsOpen,
  computeDealTurn,
  dueStageFor,
  isYourTurn,
  todayIST,
  type DealFeedQuery,
  type DealFeedResponse,
  type DealMineItem,
  type DealMineQuery,
  type DealMineResponse,
} from '@valueskins/shared';
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/types.js';
import { db } from '../db/client.js';
import { applications, deals, directPayments } from '../db/schema/index.js';
import type { ApiContext } from '../context.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import { iso, loadParties, toSummary } from './dealView.js';
import type { Deal } from './stateMachine.js';

/**
 * SPEC 16: OPEN deals whose applications are still open, newest published
 * first. A deadline is the end of its day in IST, so a deal is listed while
 * its deadline date is today (IST) or later. published_at is written from the
 * app clock (millisecond precision), so the (published_at, id) cursor loses nothing.
 * Each item says whether the signed-in creator already applied.
 */
export async function listFeed(
  ctx: ApiContext,
  user: AuthenticatedUser,
  query: DealFeedQuery,
): Promise<DealFeedResponse> {
  const conditions: SQL[] = [
    eq(deals.status, 'OPEN'),
    gte(deals.applicationDeadline, todayIST(ctx.now())),
  ];
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor, { needsTime: true });
    conditions.push(
      sql`(${deals.publishedAt}, ${deals.id}) < (${cursor.p}::timestamptz, ${cursor.i}::uuid)`,
    );
  }

  const rows = await db
    .select()
    .from(deals)
    .where(and(...conditions))
    .orderBy(desc(deals.publishedAt), desc(deals.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  const [parties, appliedRows] = await Promise.all([
    loadParties(page.map((deal) => deal.brandId)),
    page.length === 0
      ? []
      : db
          .select({ dealId: applications.dealId })
          .from(applications)
          .where(
            and(
              eq(applications.creatorId, user.id),
              inArray(
                applications.dealId,
                page.map((deal) => deal.id),
              ),
            ),
          ),
  ]);
  const applied = new Set(appliedRows.map((row) => row.dealId));

  const items = page.flatMap((deal) => {
    const brand = parties.get(deal.brandId);
    return brand ? [{ ...toSummary(deal, brand), applied: applied.has(deal.id) }] : [];
  });
  const nextCursor =
    rows.length > query.limit && last
      ? encodeCursor({ p: (last.publishedAt as Date).toISOString(), i: last.id })
      : null;
  return { items, nextCursor };
}

/** The deals (of a page) with a payment record waiting for the creator, as `dealId:stage` keys. */
async function awaitingRecords(dealIds: string[]): Promise<Set<string>> {
  if (dealIds.length === 0) return new Set();
  const rows = await db
    .select({ dealId: directPayments.dealId, stage: directPayments.stage })
    .from(directPayments)
    .where(
      and(
        inArray(directPayments.dealId, dealIds),
        isNull(directPayments.confirmedAt),
        isNull(directPayments.disputedAt),
      ),
    );
  return new Set(rows.map((row) => `${row.dealId}:${row.stage}`));
}

/** Applications on each deal of a page, any status. */
async function applicantCounts(dealIds: string[]): Promise<Map<string, number>> {
  if (dealIds.length === 0) return new Map();
  const rows = await db
    .select({ dealId: applications.dealId, value: count() })
    .from(applications)
    .where(inArray(applications.dealId, dealIds))
    .groupBy(applications.dealId);
  return new Map(rows.map((row) => [row.dealId, row.value]));
}

/** What the brand has paid and the creator confirmed on each deal of a page: the advance and the final, never the fee. */
async function receivedTotals(dealIds: string[]): Promise<Map<string, number>> {
  if (dealIds.length === 0) return new Map();
  const rows = await db
    .select({
      dealId: directPayments.dealId,
      total: sql<string>`coalesce(sum(${directPayments.amountPaise}), 0)`,
    })
    .from(directPayments)
    .where(and(inArray(directPayments.dealId, dealIds), isNotNull(directPayments.confirmedAt)))
    .groupBy(directPayments.dealId);
  return new Map(rows.map((row) => [row.dealId, Number(row.total)]));
}

/**
 * A brand's own deals (drafts included), or the deals a creator is confirmed on. Newest first,
 * optionally narrowed to several statuses. Each item says whose turn it is and what happens next
 * (SPEC 5.5); the grouped lookups below run once per page, not once per deal.
 */
export async function listMine(
  ctx: ApiContext,
  user: AuthenticatedUser,
  query: DealMineQuery,
): Promise<DealMineResponse> {
  const isBrand = user.role === 'BRAND';
  const conditions: SQL[] = [isBrand ? eq(deals.brandId, user.id) : eq(deals.creatorId, user.id)];
  if (query.status) conditions.push(inArray(deals.status, query.status));
  if (query.cursor) {
    conditions.push(lt(deals.id, decodeCursor(query.cursor, { needsTime: false }).i));
  }

  // UUID v7 ids sort by creation time, so id order is newest first.
  const rows = await db
    .select()
    .from(deals)
    .where(and(...conditions))
    .orderBy(desc(deals.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  const ids = page.map((deal) => deal.id);
  const partyIds = page.flatMap((deal) =>
    isBrand && deal.creatorId ? [deal.brandId, deal.creatorId] : [deal.brandId],
  );
  const [parties, awaiting, counts, received] = await Promise.all([
    loadParties(partyIds),
    awaitingRecords(ids),
    isBrand ? applicantCounts(ids) : new Map<string, number>(),
    isBrand ? new Map<string, number>() : receivedTotals(ids),
  ]);

  const now = ctx.now();
  const items = page.flatMap((deal: Deal): DealMineItem[] => {
    const brand = parties.get(deal.brandId);
    if (!brand) return [];
    const dueStage = dueStageFor(deal.status);
    const applicantCount = counts.get(deal.id) ?? 0;
    const turn = computeDealTurn({
      status: deal.status,
      applicantCount,
      pendingRecord: dueStage !== null && awaiting.has(`${deal.id}:${dueStage}`),
    });
    return [
      {
        ...toSummary(deal, brand),
        yourTurn: isYourTurn(turn, isBrand ? 'BRAND' : 'CREATOR'),
        nextStep: turn.nextStep,
        applicantCount: isBrand ? applicantCount : null,
        applicationsOpen: isBrand
          ? applicationsOpen(
              {
                status: deal.status,
                applicationDeadline: deal.applicationDeadline ?? '1970-01-01',
              },
              now,
            )
          : null,
        creator: isBrand && deal.creatorId ? (parties.get(deal.creatorId) ?? null) : null,
        receivedPaise: isBrand ? null : (received.get(deal.id) ?? 0),
        completedAt: iso(deal.completedAt),
        cancelledAt: iso(deal.cancelledAt),
        cancelledByRole: deal.cancelledByRole,
        cancellationReason: deal.cancellationReason,
      },
    ];
  });
  return {
    items,
    nextCursor: rows.length > query.limit && last ? encodeCursor({ i: last.id }) : null,
  };
}
