import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import type { Tx } from './stateMachine.js';

/**
 * Whether a creator has saved a UPI ID, the name on the account and their consent
 * (REPLACEMENT_PLAN 2.1). Gates applying and being confirmed.
 */
export async function hasPayoutDetails(
  userId: string,
  executor: typeof db | Tx = db,
): Promise<boolean> {
  const [row] = await executor
    .select({
      vpa: users.payoutVpa,
      name: users.payoutName,
      consentAt: users.payoutVpaConsentAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row !== undefined && row.vpa !== null && row.name !== null && row.consentAt !== null;
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
