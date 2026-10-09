import type { PayoutAccountStatus } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { creatorPayoutAccounts } from '../db/schema/index.js';
import type { Tx } from './stateMachine.js';

/** A creator's payout account status, or null when they have not started setup. */
export async function getPayoutStatus(
  userId: string,
  executor: typeof db | Tx = db,
): Promise<PayoutAccountStatus | null> {
  const [row] = await executor
    .select({ status: creatorPayoutAccounts.status })
    .from(creatorPayoutAccounts)
    .where(eq(creatorPayoutAccounts.userId, userId))
    .limit(1);
  return row?.status ?? null;
}
