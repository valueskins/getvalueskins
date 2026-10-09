import {
  todayIST,
  type DealFeedQuery,
  type DealListResponse,
  type DealMineQuery,
} from '@valueskins/shared';
import { and, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/types.js';
import { db } from '../db/client.js';
import { deals } from '../db/schema/index.js';
import type { ApiContext } from '../context.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import { loadParties, toSummary } from './dealView.js';
import type { Deal } from './stateMachine.js';

async function toListResponse(
  rows: Deal[],
  limit: number,
  cursorOf: (last: Deal) => string,
): Promise<DealListResponse> {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const parties = await loadParties(page.map((deal) => deal.brandId));
  const items = page.flatMap((deal) => {
    const brand = parties.get(deal.brandId);
    return brand ? [toSummary(deal, brand)] : [];
  });
  return { items, nextCursor: rows.length > limit && last ? cursorOf(last) : null };
}

/**
 * SPEC 16: OPEN deals whose applications are still open, newest published
 * first. A deadline is the end of its day in IST, so a deal is listed while
 * its deadline date is today (IST) or later. published_at is written from the
 * app clock (millisecond precision), so the (published_at, id) cursor loses nothing.
 */
export async function listFeed(ctx: ApiContext, query: DealFeedQuery): Promise<DealListResponse> {
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

  return toListResponse(rows, query.limit, (last) =>
    encodeCursor({ p: (last.publishedAt as Date).toISOString(), i: last.id }),
  );
}

/** A brand's own deals (drafts included), or the deals a creator is confirmed on. Newest first. */
export async function listMine(
  user: AuthenticatedUser,
  query: DealMineQuery,
): Promise<DealListResponse> {
  const conditions: SQL[] = [
    user.role === 'BRAND' ? eq(deals.brandId, user.id) : eq(deals.creatorId, user.id),
  ];
  if (query.status) conditions.push(eq(deals.status, query.status));
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

  return toListResponse(rows, query.limit, (last) => encodeCursor({ i: last.id }));
}
