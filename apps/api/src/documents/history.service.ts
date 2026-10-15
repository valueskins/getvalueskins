import type {
  DealEmailListResponse,
  DealEventListResponse,
  HistoryQuery,
} from '@valueskins/shared';
import { and, asc, desc, eq, gt, inArray, lt, type SQL } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/types.js';
import { db } from '../db/client.js';
import { dealEvents, emailLog, users } from '../db/schema/index.js';
import { decodeCursor, encodeCursor } from '../deals/cursor.js';
import { DELETED_USER_NAME } from '../deals/dealView.js';
import { eventColumns, toEventView } from '../deals/eventView.js';
import type { Deal } from '../deals/stateMachine.js';

/**
 * GET /deals/:id/emails (SPEC 8, 16): the deal's communication history. The two parties see
 * the emails sent to them or to the other party (not other applicants'), admins see every
 * email logged for the deal. Recipient addresses are never returned, only who it went to.
 */
export async function listDealEmails(
  deal: Deal,
  viewer: AuthenticatedUser,
  query: HistoryQuery,
): Promise<DealEmailListResponse> {
  const conditions: SQL[] = [eq(emailLog.dealId, deal.id)];
  if (!viewer.isAdmin) {
    const parties = deal.creatorId ? [deal.brandId, deal.creatorId] : [deal.brandId];
    conditions.push(inArray(emailLog.userId, parties));
  }
  if (query.cursor)
    conditions.push(lt(emailLog.id, decodeCursor(query.cursor, { needsTime: false }).i));

  const rows = await db
    .select({
      email: emailLog,
      username: users.username,
      role: users.role,
      deletedAt: users.deletedAt,
    })
    .from(emailLog)
    .leftJoin(users, eq(users.id, emailLog.userId))
    .where(and(...conditions))
    .orderBy(desc(emailLog.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => {
      const role =
        r.email.userId === deal.brandId
          ? 'BRAND'
          : r.email.userId === deal.creatorId
            ? 'CREATOR'
            : r.role;
      return {
        id: r.email.id,
        template: r.email.template,
        subject: r.email.subject,
        bodyText: r.email.bodyText,
        status: r.email.status,
        attachmentNames: r.email.attachmentNames ?? [],
        recipient:
          r.username && role
            ? { role, username: r.deletedAt ? DELETED_USER_NAME : r.username }
            : null,
        createdAt: r.email.createdAt.toISOString(),
      };
    }),
    nextCursor: rows.length > query.limit && last ? encodeCursor({ i: last.email.id }) : null,
  };
}

/** GET /deals/:id/events: every event of the deal, oldest first (status changes and payment records). The internal metadata stays internal. */
export async function listDealEvents(
  deal: Deal,
  query: HistoryQuery,
): Promise<DealEventListResponse> {
  const conditions: SQL[] = [eq(dealEvents.dealId, deal.id)];
  if (query.cursor)
    conditions.push(gt(dealEvents.id, decodeCursor(query.cursor, { needsTime: false }).i));

  const rows = await db
    .select(eventColumns)
    .from(dealEvents)
    .leftJoin(users, eq(users.id, dealEvents.actorId))
    .where(and(...conditions))
    .orderBy(asc(dealEvents.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => toEventView(r, deal)),
    nextCursor: rows.length > query.limit && last ? encodeCursor({ i: last.event.id }) : null,
  };
}
