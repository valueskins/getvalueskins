import type { PayoutAccountStatus, PayoutRequirement } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { db, withTransaction } from '../db/client.js';
import { creatorPayoutAccounts, users } from '../db/schema/index.js';
import { send } from '../email/send.js';
import type { Env } from '../env/index.js';
import type { RawRequirement } from '../razorpay/schemas.js';

/** Razorpay activation_status -> our status. Unknown values stay PENDING. */
export function mapActivationStatus(activationStatus: string): PayoutAccountStatus {
  switch (activationStatus) {
    case 'activated':
      return 'ACTIVE';
    case 'needs_clarification':
      return 'NEEDS_CLARIFICATION';
    case 'suspended':
      return 'SUSPENDED';
    default:
      return 'PENDING';
  }
}

/** Keeps only the fields that tell the creator what to fix. */
export function sanitizeRequirements(raw: RawRequirement[] | undefined): PayoutRequirement[] {
  return (raw ?? []).map((item) => ({
    fieldReference: item.field_reference,
    reasonCode: item.reason_code,
    status: item.status ?? null,
  }));
}

export type ApplyStatusResult =
  | { kind: 'unknown_account' }
  | { kind: 'stale' }
  | { kind: 'applied'; userId: string; previous: PayoutAccountStatus; changed: boolean };

export interface ApplyStatusInput {
  razorpayAccountId: string;
  status: PayoutAccountStatus;
  requirements: PayoutRequirement[];
  /** When Razorpay says this state was true (webhook created_at), or now for a refresh. */
  observedAt: Date;
}

/**
 * The one place a payout status changes (webhook, refresh and setup all use
 * it). Ignores a state older than the last one applied (webhooks can arrive
 * out of order), and sends email #16 once, after commit, only when the status
 * actually changed to ACTIVE or NEEDS_CLARIFICATION.
 */
export async function applyPayoutStatus(
  env: Env,
  input: ApplyStatusInput,
): Promise<ApplyStatusResult> {
  const result = await withTransaction(async (tx): Promise<ApplyStatusResult> => {
    const [row] = await tx
      .select()
      .from(creatorPayoutAccounts)
      .where(eq(creatorPayoutAccounts.razorpayAccountId, input.razorpayAccountId))
      .for('update')
      .limit(1);

    if (!row) return { kind: 'unknown_account' };
    if (row.statusSyncedAt && row.statusSyncedAt.getTime() > input.observedAt.getTime()) {
      return { kind: 'stale' };
    }

    await tx
      .update(creatorPayoutAccounts)
      .set({
        status: input.status,
        requirements: { items: input.requirements },
        statusSyncedAt: input.observedAt,
      })
      .where(eq(creatorPayoutAccounts.userId, row.userId));

    return {
      kind: 'applied',
      userId: row.userId,
      previous: row.status,
      changed: row.status !== input.status,
    };
  });

  if (
    result.kind === 'applied' &&
    result.changed &&
    (input.status === 'ACTIVE' || input.status === 'NEEDS_CLARIFICATION')
  ) {
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, result.userId))
      .limit(1);
    if (user?.email) {
      await send('PAYOUT_ACCOUNT_STATUS', user.email, { status: input.status }, env, {
        userId: result.userId,
      });
    }
  }

  return result;
}
