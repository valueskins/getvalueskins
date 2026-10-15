import type { DealStatus, DirectPaymentStage } from '@valueskins/shared';
import { dealEvents } from '../db/schema/index.js';
import type { Tx } from './stateMachine.js';

/** The kinds of deal event that are not a status change (SPEC 15). */
export type PaymentEventKind = 'PAYMENT_RECORDED' | 'PAYMENT_NOT_RECEIVED';

/**
 * Writes the deal event for a direct payment that was recorded or marked not received, inside the
 * transaction of that change, so the two are never apart. The status did not move, so the event
 * names the status the deal was in as both its start and its end. Metadata holds ids only: the UPI
 * ID and the reference never go into an event (REPLACEMENT_PLAN 2.1). Status changes are written
 * by `transitionDeal` and nothing else writes this table (an architecture test checks it).
 */
export async function recordPaymentEvent(
  tx: Tx,
  input: {
    dealId: string;
    status: DealStatus;
    kind: PaymentEventKind;
    directPaymentId: string;
    stage: DirectPaymentStage;
    /** The brand that recorded it, or the creator that said it did not arrive. */
    actorId: string;
    note?: string | null;
  },
): Promise<void> {
  await tx.insert(dealEvents).values({
    dealId: input.dealId,
    fromStatus: input.status,
    toStatus: input.status,
    actorId: input.actorId,
    actorType: 'USER',
    note: input.note ?? null,
    metadata: { kind: input.kind, directPaymentId: input.directPaymentId, stage: input.stage },
  });
}
