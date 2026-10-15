import type { DealParty, DealSummary } from '@valueskins/shared';
import { inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import type { Deal } from './stateMachine.js';

export const DELETED_USER_NAME = 'Deleted user';

export function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export interface PartyRow {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  deletedAt: Date | null;
}

export function toParty(row: PartyRow): DealParty {
  if (row.deletedAt) {
    return { id: row.id, username: DELETED_USER_NAME, profilePictureUrl: null };
  }
  return { id: row.id, username: row.username, profilePictureUrl: row.profilePictureUrl };
}

/** The brand and creator shown on deals, by user id. A user missing from the result does not exist. */
export async function loadParties(ids: string[]): Promise<Map<string, DealParty>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      profilePictureUrl: users.profilePictureUrl,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((row) => [row.id, toParty(row)]));
}

export function toSummary(deal: Deal, brand: DealParty): DealSummary {
  return {
    id: deal.id,
    shortId: deal.shortId,
    status: deal.status,
    title: deal.title,
    description: deal.description,
    budgetPaise: deal.budgetPaise,
    creatorAmountPaise: deal.creatorAmountPaise,
    advancePaise: deal.advancePaise,
    finalPaise: deal.finalPaise,
    applicationDeadline: deal.applicationDeadline,
    contentUploadDeadline: deal.contentUploadDeadline,
    dealDeadline: deal.dealDeadline,
    publishedAt: iso(deal.publishedAt),
    createdAt: deal.createdAt.toISOString(),
    brand,
  };
}
