import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { isUniqueViolation } from '../db/pgErrors.js';
import { payments, transfers } from '../db/schema/index.js';
import { findDeal } from '../deals/access.js';
import { transitionDeal, type AfterCommitTask, type Deal, type Tx } from '../deals/stateMachine.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';
import type { RazorpayTransfer } from '../razorpay/schemas.js';
import { issueInvoice } from '../invoices/issueInvoice.js';
import { companyFromEnv, type CompanyDetails } from '../invoices/snapshot.js';
import { alertAdmin } from './alerts.js';
import { captureEmailTasks } from './captureEmails.js';
import { mapRazorpayError } from './errors.js';
import { mapTransferStatus, secondsToDate, transferFailureReason } from './transfers.service.js';
import { PAYMENT_RULES, type PaymentsDeps } from './types.js';

type PaymentRow = typeof payments.$inferSelect;
type TransferInsert = typeof transfers.$inferInsert;

export type CaptureResult =
  | { kind: 'ignored' }
  | { kind: 'already_captured' }
  /** `dealMoved` is false when the payment was real but the deal was no longer in the status it is due in. */
  | { kind: 'captured'; dealMoved: boolean };

/** Thrown inside the capture transaction when another caller already recorded this payment. */
class AlreadyCaptured extends Error {}

const DEAL_COLUMN = {
  COMMISSION: 'commissionPaidAt',
  ADVANCE: 'advancePaidAt',
  FINAL: 'completedAt',
} as const;

/**
 * The one place a payment becomes CAPTURED (SPEC 7.3). The verify endpoint and the
 * payment.captured, order.paid and transfer webhooks all call it, in any order and any
 * number of times; the payment row lock and the deal's conditional status update make
 * exactly one caller do the work.
 *
 * Razorpay is asked for the payment itself, so neither a browser nor a webhook body is
 * trusted for the status or the amount.
 */
export async function markPaymentCaptured(
  deps: PaymentsDeps,
  orderId: string,
  paymentId: string,
): Promise<CaptureResult> {
  const [row] = await db
    .select()
    .from(payments)
    .where(eq(payments.razorpayOrderId, orderId))
    .limit(1);
  if (!row) return { kind: 'ignored' };
  if (row.status === 'CAPTURED') return { kind: 'already_captured' };

  let remote;
  try {
    remote = await deps.razorpay.fetchPayment(paymentId);
  } catch (error) {
    throw mapRazorpayError(error);
  }
  if (remote.order_id !== orderId) {
    throw new AppError('PAYMENT_ORDER_MISMATCH', 409, 'This payment belongs to a different order');
  }
  if (remote.status !== 'captured') {
    throw new AppError(
      'PAYMENT_NOT_CAPTURED',
      409,
      `The payment is ${remote.status}, not captured`,
    );
  }
  if (remote.amount !== row.amountPaise || remote.currency !== 'INR') {
    // Nothing is recorded. The webhook path records the error and alerts the admin (A1) through
    // processWebhookEvent; the verify route sends the alert itself.
    throw new AppError(
      'PAYMENT_AMOUNT_MISMATCH',
      409,
      `Order ${orderId}, payment ${paymentId}: Razorpay captured ${remote.amount} ${remote.currency}, ` +
        `the order was for ${row.amountPaise} INR. Nothing was recorded.`,
    );
  }

  const deal = await findDeal(row.dealId);
  if (!deal) throw new Error(`payment ${row.id} has no deal`);
  const rules = PAYMENT_RULES[row.type];
  const transfer = rules.transfersToCreator ? await planTransfer(deps, deal, row, paymentId) : null;

  const fees: CaptureFees = { feePaise: remote.fee ?? null, taxPaise: remote.tax ?? null };
  const afterCommit: AfterCommitTask[] = [...captureEmailTasks(deps, row)];
  if (transfer?.status === 'FAILED') {
    afterCommit.push(async (moved) => alertTransferFailed(deps, moved, transfer));
  }

  try {
    await transitionDeal({
      dealId: deal.id,
      from: rules.from,
      to: rules.to,
      actor: { role: 'SYSTEM' },
      patch: { [DEAL_COLUMN[row.type]]: deps.now() },
      metadata: { paymentId: row.id, razorpayPaymentId: paymentId, type: row.type },
      within: (tx, updated) =>
        recordCapture(tx, row, paymentId, deps.now(), transfer, fees, {
          deal: updated,
          company: companyFromEnv(deps.env),
        }),
      afterCommit,
    });
    return { kind: 'captured', dealMoved: true };
  } catch (error) {
    if (error instanceof AlreadyCaptured) return { kind: 'already_captured' };
    if (error instanceof AppError && error.code === 'INVALID_TRANSITION') {
      return recordWithoutTransition(deps, row, paymentId, transfer, fees);
    }
    if (isUniqueViolation(error)) return recordDuplicate(deps, row, paymentId);
    throw error;
  }
}

interface CaptureFees {
  feePaise: number | null;
  taxPaise: number | null;
}

/**
 * The payment, transfer and invoice rows, written inside the deal transition's transaction.
 * `invoice` is given only when the deal moves: a payment recorded on a deal that cannot take
 * it is going to be refunded by hand, so it gets no invoice (SPEC 7.3, 7.4).
 */
async function recordCapture(
  tx: Tx,
  row: PaymentRow,
  paymentId: string,
  now: Date,
  transfer: TransferInsert | null,
  fees: CaptureFees,
  invoice?: { deal: Deal; company: CompanyDetails },
): Promise<void> {
  const [updated] = await tx
    .update(payments)
    .set({
      status: 'CAPTURED',
      razorpayPaymentId: paymentId,
      capturedAt: now,
      failureReason: null,
      razorpayFeePaise: fees.feePaise,
      razorpayTaxPaise: fees.taxPaise,
    })
    .where(and(eq(payments.id, row.id), inArray(payments.status, ['CREATED', 'FAILED'])))
    .returning({ id: payments.id });
  if (!updated) throw new AlreadyCaptured();
  if (transfer) await tx.insert(transfers).values(transfer);
  if (invoice) {
    await issueInvoice(tx, {
      deal: invoice.deal,
      payment: { ...row, razorpayPaymentId: paymentId },
      transferId: transfer?.razorpayTransferId ?? null,
      now,
      company: invoice.company,
    });
  }
}

/**
 * The money was taken but the deal is not in the status this payment moves it from (for
 * example the brand cancelled while Checkout was open). The payment is recorded as it
 * happened, the deal is left alone, and the admin is told to refund it by hand (SPEC 12).
 */
async function recordWithoutTransition(
  deps: PaymentsDeps,
  row: PaymentRow,
  paymentId: string,
  transfer: TransferInsert | null,
  fees: CaptureFees,
): Promise<CaptureResult> {
  try {
    const outcome = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, row.id))
        .for('update')
        .limit(1);
      if (!locked || locked.status === 'CAPTURED') return 'already' as const;
      await recordCapture(tx, row, paymentId, deps.now(), transfer, fees);
      return 'recorded' as const;
    });
    if (outcome === 'already') return { kind: 'already_captured' };
  } catch (error) {
    if (error instanceof AlreadyCaptured) return { kind: 'already_captured' };
    if (isUniqueViolation(error)) return recordDuplicate(deps, row, paymentId);
    throw error;
  }

  const current = await findDeal(row.dealId);
  await alertAdmin(
    deps.env,
    'Payment captured on a deal that cannot take it',
    `Payment ${paymentId} (${row.type}, ${row.amountPaise} paise) for deal ${current?.shortId ?? row.dealId} ` +
      `was captured while the deal was ${current?.status ?? 'missing'}. The deal was not changed. ` +
      'Refund it manually in Razorpay.',
  );
  return { kind: 'captured', dealMoved: false };
}

/** A second captured payment for the same deal and type. It cannot be stored as CAPTURED. */
async function recordDuplicate(
  deps: PaymentsDeps,
  row: PaymentRow,
  paymentId: string,
): Promise<CaptureResult> {
  const [other] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.dealId, row.dealId),
        eq(payments.type, row.type),
        eq(payments.status, 'CAPTURED'),
        ne(payments.id, row.id),
      ),
    )
    .limit(1);
  if (!other) throw new Error(`payment ${row.id} hit a capture conflict with no other payment`);

  await db
    .update(payments)
    .set({
      status: 'FAILED',
      failureReason: 'Duplicate capture of the same payment type. Refund it.',
    })
    .where(eq(payments.id, row.id));
  await alertAdmin(
    deps.env,
    'Duplicate payment captured',
    `Payment ${paymentId} (${row.type}, ${row.amountPaise} paise) was captured for deal ${row.dealId}, ` +
      'which already has a captured payment of that type. Refund it manually in Razorpay.',
  );
  return { kind: 'already_captured' };
}

/**
 * The transfer row for an advance or final payment. Razorpay creates the transfer once the
 * payment is captured, so it is usually listed already; if not, a PENDING row without an id is
 * stored and the first transfer webhook fills the id in.
 */
async function planTransfer(
  deps: PaymentsDeps,
  deal: Deal,
  row: PaymentRow,
  paymentId: string,
): Promise<TransferInsert> {
  if (!deal.creatorId) throw new Error(`deal ${deal.id} has no creator for a ${row.type} payment`);
  let listed: RazorpayTransfer[] = [];
  try {
    listed = (await deps.razorpay.fetchPaymentTransfers(paymentId)).items;
  } catch (error) {
    // The capture matters more than the list; the transfer webhook completes the row.
    logger.warn(
      { dealId: deal.id, error: error instanceof Error ? error.message : 'unknown' },
      'could not list transfers for a captured payment',
    );
  }
  // An order made before the rail changed carries one transfer for the full amount.
  const match = listed.find((t) => t.amount === row.amountPaise) ?? null;

  if (match) {
    // Amounts only, for the fee report (SPEC 4.3). No personal data is involved.
    logger.info(
      {
        dealId: deal.id,
        transferId: match.id,
        amount: match.amount,
        fees: match.fees,
        tax: match.tax,
        status: match.status,
      },
      'route transfer listed for a captured payment',
    );
  }

  return {
    dealId: deal.id,
    paymentId: row.id,
    creatorId: deal.creatorId,
    type: row.type as 'ADVANCE' | 'FINAL',
    amountPaise: row.amountPaise,
    razorpayTransferId: match?.id ?? null,
    status: match ? mapTransferStatus(match.status) : 'PENDING',
    failureReason: match ? transferFailureReason(match) : null,
    processedAt: match ? secondsToDate(match.processed_at) : null,
    razorpayFeePaise: match?.fees ?? null,
    razorpayTaxPaise: match?.tax ?? null,
  };
}

/** Alert A1 for a transfer that failed (SPEC 7.3): the deal still advances, the admin sorts the payout. */
export async function alertTransferFailed(
  deps: PaymentsDeps,
  deal: Deal,
  transfer: {
    razorpayTransferId?: string | null;
    type: string;
    amountPaise: number;
    failureReason?: string | null;
  },
): Promise<void> {
  await alertAdmin(
    deps.env,
    'Transfer to creator failed',
    `Deal ${deal.shortId}: the ${transfer.type} transfer of ${transfer.amountPaise} paise ` +
      `(${transfer.razorpayTransferId ?? 'no transfer id yet'}) failed: ${transfer.failureReason ?? 'no reason given'}. ` +
      'The brand has paid and the deal has moved on. Check Razorpay and pay the creator.',
  );
}
