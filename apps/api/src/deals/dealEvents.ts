import type { DealStatus, DirectPaymentStage } from '@valueskins/shared';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { dealEvents, deals } from '../db/schema/index.js';
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

/** Whether the deal already has an event of this kind that names this Razorpay payment under this key. */
async function eventExists(
  tx: Tx,
  dealId: string,
  kind: string,
  key: 'razorpayPaymentId' | 'extraRazorpayPaymentId',
  razorpayPaymentId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: dealEvents.id })
    .from(dealEvents)
    .where(
      and(
        eq(dealEvents.dealId, dealId),
        sql`${dealEvents.metadata}->>'kind' = ${kind}`,
        sql`${dealEvents.metadata}->>${key} = ${razorpayPaymentId}`,
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** The status the deal is in now, which a payment event names as both its start and its end. */
async function currentStatus(tx: Tx, dealId: string): Promise<DealStatus> {
  const [deal] = await tx
    .select({ status: deals.status })
    .from(deals)
    .where(eq(deals.id, dealId))
    .limit(1);
  if (!deal) throw new Error(`deal ${dealId} not found`);
  return deal.status;
}

/**
 * A second captured payment arrived for an order that is already paid (SPEC 7.3). The paid payment
 * and the deal are left alone; this event marks the extra one so it is refunded by hand. Written
 * once per extra Razorpay payment: it returns true only for the call that wrote it, and that call
 * alone alerts the admin. Call it inside a transaction that holds the lock on the fee payment row,
 * so two callers cannot both write it. Metadata holds ids and the amount only.
 */
export async function recordExtraPaymentOnPaidOrder(
  tx: Tx,
  input: {
    dealId: string;
    paymentId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    extraRazorpayPaymentId: string;
    amountPaise: number;
  },
): Promise<boolean> {
  const kind = 'EXTRA_PAYMENT_ON_PAID_ORDER';
  if (
    await eventExists(
      tx,
      input.dealId,
      kind,
      'extraRazorpayPaymentId',
      input.extraRazorpayPaymentId,
    )
  ) {
    return false;
  }
  const status = await currentStatus(tx, input.dealId);
  await tx.insert(dealEvents).values({
    dealId: input.dealId,
    fromStatus: status,
    toStatus: status,
    actorId: null,
    actorType: 'SYSTEM',
    note: null,
    metadata: {
      kind,
      paymentId: input.paymentId,
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      extraRazorpayPaymentId: input.extraRazorpayPaymentId,
      amountPaise: input.amountPaise,
    },
  });
  return true;
}

/**
 * Razorpay captured a payment whose amount or currency is not the order's: it is not accepted
 * (nothing is stored on the payment), and this event keeps what was expected and received (SPEC
 * 7.3). Written once per Razorpay payment; true only for the call that wrote it, and that call
 * alone alerts the admin. Call it inside a transaction that holds the lock on the fee payment row.
 */
export async function recordFeeAmountMismatch(
  tx: Tx,
  input: {
    dealId: string;
    paymentId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    expectedAmountPaise: number;
    expectedCurrency: string;
    receivedAmountPaise: number;
    receivedCurrency: string;
  },
): Promise<boolean> {
  const kind = 'FEE_AMOUNT_MISMATCH';
  if (await eventExists(tx, input.dealId, kind, 'razorpayPaymentId', input.razorpayPaymentId)) {
    return false;
  }
  const status = await currentStatus(tx, input.dealId);
  await tx.insert(dealEvents).values({
    dealId: input.dealId,
    fromStatus: status,
    toStatus: status,
    actorId: null,
    actorType: 'SYSTEM',
    note: null,
    metadata: {
      kind,
      paymentId: input.paymentId,
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      expectedAmountPaise: input.expectedAmountPaise,
      expectedCurrency: input.expectedCurrency,
      receivedAmountPaise: input.receivedAmountPaise,
      receivedCurrency: input.receivedCurrency,
    },
  });
  return true;
}
