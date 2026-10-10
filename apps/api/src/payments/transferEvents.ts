import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deals, payments, transfers } from '../db/schema/index.js';
import { logger } from '../logging/logger.js';
import { RazorpayApiError } from '../razorpay/errors.js';
import type { RazorpayTransfer } from '../razorpay/schemas.js';
import { alertTransferFailed, markPaymentCaptured } from './markPaymentCaptured.js';
import { mapRazorpayError } from './errors.js';
import {
  canMoveTransfer,
  mapTransferStatus,
  secondsToDate,
  transferFailureReason,
} from './transfers.service.js';
import type { PaymentsDeps } from './types.js';

type TransferRow = typeof transfers.$inferSelect;

/** The payment a transfer came from. Razorpay's `source` is the payment id (or the order id). */
async function findSourcePayment(source: string) {
  const column = source.startsWith('order_')
    ? payments.razorpayOrderId
    : payments.razorpayPaymentId;
  const [row] = await db.select().from(payments).where(eq(column, source)).limit(1);
  return row ?? null;
}

async function findTransferRow(
  deps: PaymentsDeps,
  transfer: RazorpayTransfer,
): Promise<TransferRow | null> {
  const [byId] = await db
    .select()
    .from(transfers)
    .where(eq(transfers.razorpayTransferId, transfer.id))
    .limit(1);
  if (byId) return byId;

  const source = transfer.source;
  if (!source) return null;

  let payment = await findSourcePayment(source);
  if (!payment && source.startsWith('pay_')) {
    // The transfer event beat the payment's own event. A processed transfer proves the
    // payment was captured, so record it now (idempotent) instead of waiting for it.
    let remote;
    try {
      remote = await deps.razorpay.fetchPayment(source);
    } catch (error) {
      // Razorpay does not know this payment under our keys: the transfer is not ours.
      if (error instanceof RazorpayApiError && error.isRejection) return null;
      throw mapRazorpayError(error);
    }
    if (remote.order_id) {
      await markPaymentCaptured(deps, remote.order_id, source);
      payment = await findSourcePayment(source);
    }
  }
  if (!payment) return null;

  // Without an id yet: the PENDING row recorded at capture time, waiting for its transfer.
  const [waiting] = await db
    .select()
    .from(transfers)
    .where(
      and(
        eq(transfers.paymentId, payment.id),
        isNull(transfers.razorpayTransferId),
        eq(transfers.amountPaise, transfer.amount),
      ),
    )
    .limit(1);
  return waiting ?? null;
}

/**
 * transfer.processed, transfer.failed and transfer.reversed (SPEC 7.3). Finds our transfer
 * row (filling in its Razorpay id the first time), moves the status forward only, and sends
 * alert A1 the first time a transfer is FAILED. The deal is never touched: the brand paid.
 */
export async function applyTransferEvent(
  deps: PaymentsDeps,
  transfer: RazorpayTransfer,
): Promise<void> {
  const row = await findTransferRow(deps, transfer);
  if (!row) throw new Error(`Transfer event ${transfer.id} matches no transfer we created`);

  const next = mapTransferStatus(transfer.status);
  const reason = next === 'FAILED' ? transferFailureReason(transfer) : null;

  // Amounts only, for the fee report (SPEC 4.3).
  logger.info(
    {
      transferId: transfer.id,
      amount: transfer.amount,
      fees: transfer.fees,
      tax: transfer.tax,
      status: transfer.status,
    },
    'route transfer event',
  );

  const outcome = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(transfers)
      .where(eq(transfers.id, row.id))
      .for('update')
      .limit(1);
    if (!locked) return null;

    const move = canMoveTransfer(locked.status, next);
    await tx
      .update(transfers)
      .set({
        razorpayTransferId: locked.razorpayTransferId ?? transfer.id,
        razorpayFeePaise: transfer.fees ?? locked.razorpayFeePaise,
        razorpayTaxPaise: transfer.tax ?? locked.razorpayTaxPaise,
        ...(move
          ? {
              status: next,
              failureReason: reason ?? locked.failureReason,
              processedAt: secondsToDate(transfer.processed_at) ?? locked.processedAt,
            }
          : {}),
      })
      .where(eq(transfers.id, row.id));
    return { moved: move, previous: locked.status };
  });
  if (!outcome || !outcome.moved || next !== 'FAILED') return;

  const [deal] = await db.select().from(deals).where(eq(deals.id, row.dealId)).limit(1);
  if (deal) {
    await alertTransferFailed(deps, deal, {
      razorpayTransferId: transfer.id,
      type: row.type,
      amountPaise: row.amountPaise,
      failureReason: reason,
    });
  }
}
