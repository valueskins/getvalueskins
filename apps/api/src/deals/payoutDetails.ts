import type { CreatorPayoutStatus } from '@valueskins/shared';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import type { Tx } from './stateMachine.js';

/** What a creator's saved details allow. A UPI ID needs the name on the account too (REPLACEMENT_PLAN 2.1). */
function payoutStatusOf(row: {
  vpa: string | null;
  name: string | null;
  consentAt: Date | null;
}): CreatorPayoutStatus {
  if (row.vpa === null || row.name === null) return 'NO_UPI';
  if (row.consentAt === null) return 'NO_CONSENT';
  return 'SET';
}

/**
 * The payout status of each creator, for a page of people in one query: saved with consent, no UPI
 * ID or name, or a UPI ID without consent. A user that does not exist is missing from the map. Only
 * the status leaves this file, never the UPI ID.
 */
export async function loadPayoutStatuses(
  userIds: string[],
  executor: typeof db | Tx = db,
): Promise<Map<string, CreatorPayoutStatus>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const rows = await executor
    .select({
      id: users.id,
      vpa: users.payoutVpa,
      name: users.payoutName,
      consentAt: users.payoutVpaConsentAt,
    })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((row) => [row.id, payoutStatusOf(row)]));
}

/**
 * Whether a creator has saved a UPI ID, the name on the account and their consent
 * (REPLACEMENT_PLAN 2.1). Gates applying and being confirmed.
 */
export async function hasPayoutDetails(
  userId: string,
  executor: typeof db | Tx = db,
): Promise<boolean> {
  return (await loadPayoutStatuses([userId], executor)).get(userId) === 'SET';
}

/**
 * The creator's payout details exactly as saved, for the one place that shows the full UPI ID to
 * the brand confirmed on the deal (REPLACEMENT_PLAN 2.1). Nothing else reads the full ID.
 */
export async function readPayoutForPayment(creatorId: string, executor: typeof db | Tx = db) {
  const [row] = await executor
    .select({
      vpa: users.payoutVpa,
      name: users.payoutName,
      consentAt: users.payoutVpaConsentAt,
    })
    .from(users)
    .where(eq(users.id, creatorId))
    .limit(1);
  return row ?? { vpa: null, name: null, consentAt: null };
}

/** The reason code for a creator whose payout is not set, from what `readPayoutForPayment` returned. */
export function payoutStatusOfSaved(row: {
  vpa: string | null;
  name: string | null;
  consentAt: Date | null;
}): CreatorPayoutStatus {
  return payoutStatusOf(row);
}
