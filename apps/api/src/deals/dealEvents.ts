import type { DealStatus, DirectPaymentStage } from '@valueskins/shared';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
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

/**
 * The fee was captured, but the deal had already changed, so the payment was kept without moving
 * the deal (SPEC 7.3). Written in the transaction that records the capture, once per payment; the
 * verify route finds it to answer FEE_CAPTURED_DEAL_CHANGED. Metadata holds ids only.
 */
export async function recordFeeCapturedOnChangedDeal(
  tx: Tx,
  input: { dealId: string; status: DealStatus; paymentId: string },
): Promise<void> {
  await tx.insert(dealEvents).values({
    dealId: input.dealId,
    fromStatus: input.status,
    toStatus: input.status,
    actorId: null,
    actorType: 'SYSTEM',
    note: null,
    metadata: { kind: 'FEE_CAPTURED_DEAL_CHANGED', paymentId: input.paymentId },
  });
}

/** Whether the fee payment `paymentId` (our id) was captured on a deal that had changed. */
export async function feeCapturedOnChangedDeal(
  dealId: string,
  paymentId: string,
  tx: Tx | typeof db = db,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: dealEvents.id })
    .from(dealEvents)
    .where(
      and(
        eq(dealEvents.dealId, dealId),
        sql`${dealEvents.metadata}->>'kind' = 'FEE_CAPTURED_DEAL_CHANGED'`,
        sql`${dealEvents.metadata}->>'paymentId' = ${paymentId}`,
      ),
    )
    .limit(1);
  return row !== undefined;
}
