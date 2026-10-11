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
