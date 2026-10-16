import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { isUniqueViolation } from '../db/pgErrors.js';
import {
  FEE_CAPTURED_DEAL_CHANGED_ALERT,
  PAYMENT_COULD_NOT_BE_CONFIRMED,
  PAYMENT_NOT_CONFIRMED_YET,
  type DealStatus,
} from '@valueskins/shared';
import { deals, payments } from '../db/schema/index.js';
import { findDeal } from '../deals/access.js';
import { feeCapturedOnChangedDeal, recordFeeCapturedOnChangedDeal } from '../deals/dealEvents.js';
import { emailOf } from '../email/recipients.js';
import { send } from '../email/send.js';
import { logger } from '../logging/logger.js';
import { captureError } from '../observability/sentry.js';
import { emitDealChanged } from '../realtime/events.js';
import { transitionDeal, type AfterCommitTask, type Deal, type Tx } from '../deals/stateMachine.js';
import { AppError } from '../errors/AppError.js';
import { issueInvoice } from '../invoices/issueInvoice.js';
import { companyFromEnv, type CompanyDetails } from '../invoices/snapshot.js';
import { alertAdmin } from './alerts.js';
import { captureEmailTasks } from './captureEmails.js';
import { mapRazorpayError } from './errors.js';
import { PAYMENT_RULES, type PaymentsDeps } from './types.js';

type PaymentRow = typeof payments.$inferSelect;

export type CaptureResult =
  | { kind: 'ignored' }
  | { kind: 'already_captured' }
  /** `dealMoved` is false when the payment was real but the deal was no longer in the status it is due in. */
  | { kind: 'captured'; dealMoved: boolean };

/** Thrown inside the capture transaction when another caller already recorded this payment. */
class AlreadyCaptured extends Error {}

/**
 * The one place a payment becomes CAPTURED (SPEC 7.3). The verify endpoint and the
 * payment.captured and order.paid webhooks all call it, in any order and any
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
      PAYMENT_NOT_CONFIRMED_YET,
      undefined,
      `Payment ${paymentId} for order ${orderId} is ${remote.status} at Razorpay, not captured.`,
    );
  }
  if (remote.amount !== row.amountPaise || remote.currency !== 'INR') {
    // Nothing is recorded. The webhook path records the detail on the event and alerts the admin
    // (A1) through processWebhookEvent; the verify route sends the alert itself.
    throw new AppError(
      'PAYMENT_AMOUNT_MISMATCH',
      409,
      PAYMENT_COULD_NOT_BE_CONFIRMED,
      undefined,
      `Order ${orderId}, payment ${paymentId}: Razorpay captured ${remote.amount} ${remote.currency}, ` +
        `the order was for ${row.amountPaise} INR. Nothing was recorded.`,
    );
  }

  const deal = await findDeal(row.dealId);
  if (!deal) throw new Error(`payment ${row.id} has no deal`);
  const rules = PAYMENT_RULES[row.type];

  const fees: CaptureFees = { feePaise: remote.fee ?? null, taxPaise: remote.tax ?? null };
  const afterCommit: AfterCommitTask[] = [...captureEmailTasks(deps, row)];

  try {
    await transitionDeal({
      dealId: deal.id,
      from: rules.from,
      to: rules.to,
      actor: { role: 'SYSTEM' },
      patch: { commissionPaidAt: deps.now() },
      metadata: { paymentId: row.id, razorpayPaymentId: paymentId, type: row.type },
      within: (tx, updated) =>
        recordCapture(tx, row, paymentId, deps.now(), fees, {
          deal: updated,
          company: companyFromEnv(deps.env),
        }),
      afterCommit,
    });
    return { kind: 'captured', dealMoved: true };
  } catch (error) {
    if (error instanceof AlreadyCaptured) return { kind: 'already_captured' };
    if (error instanceof AppError && error.code === 'INVALID_TRANSITION') {
      return recordWithoutTransition(deps, row, paymentId, fees);
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
 * The payment and invoice rows, written inside the deal transition's transaction.
 * `invoice` is given only when the deal moves: a payment recorded on a deal that cannot take
 * it is going to be refunded by hand, so it gets no invoice (SPEC 7.3, 7.4).
 */
async function recordCapture(
  tx: Tx,
  row: PaymentRow,
  paymentId: string,
  now: Date,
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
  if (invoice) {
    await issueInvoice(tx, {
      deal: invoice.deal,
      payment: { ...row, razorpayPaymentId: paymentId },
      now,
      company: invoice.company,
    });
  }
}

/**
 * The money was taken but the deal is not in the status this payment moves it from (for
 * example the brand cancelled while Checkout was open). The payment is recorded as CAPTURED, the
 * deal is left alone, and a deal event marks it, in one transaction (SPEC 7.3). Only the caller
 * that recorded it then tells the admin to refund it by hand (A1) and emails the brand (#21); the
 * verify route answers FEE_CAPTURED_DEAL_CHANGED from the event.
 */
async function recordWithoutTransition(
  deps: PaymentsDeps,
  row: PaymentRow,
  paymentId: string,
  fees: CaptureFees,
): Promise<CaptureResult> {
  let status: DealStatus;
  try {
    const outcome = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, row.id))
        .for('update')
        .limit(1);
      if (!locked || locked.status === 'CAPTURED') return null;
      await recordCapture(tx, row, paymentId, deps.now(), fees);
      const [deal] = await tx
        .select({ status: deals.status })
        .from(deals)
        .where(eq(deals.id, row.dealId))
        .limit(1);
      if (!deal) throw new Error(`payment ${row.id} has no deal`);
      await recordFeeCapturedOnChangedDeal(tx, {
        dealId: row.dealId,
        status: deal.status,
        paymentId: row.id,
      });
      return deal.status;
    });
    if (outcome === null) return { kind: 'already_captured' };
    status = outcome;
  } catch (error) {
    if (error instanceof AlreadyCaptured) return { kind: 'already_captured' };
    if (isUniqueViolation(error)) return recordDuplicate(deps, row, paymentId);
    throw error;
  }

  await afterChangedDealCapture(
    deps,
    row,
    `Payment ${paymentId} (${row.type}, ${row.amountPaise} paise) was captured while the deal was ` +
      `${status}. The payment is kept as CAPTURED and the deal was not changed. Refund it by hand in Razorpay.`,
  );
  return { kind: 'captured', dealMoved: false };
}

/**
 * A second captured payment for the same deal and type. It cannot be stored as CAPTURED (one
 * captured fee per deal), so it is marked FAILED for a refund. To the brand it is the same case as
 * a changed deal: the money went through and will be refunded, so it gets the same event, email
 * and verify answer, once.
 */
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

  const first = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.id, row.id))
      .for('update')
      .limit(1);
    if (!locked) return false;
    await tx
      .update(payments)
      .set({
        status: 'FAILED',
        razorpayPaymentId: paymentId,
        failureReason: 'Duplicate capture of the same payment type. Refund it.',
      })
      .where(eq(payments.id, row.id));
    if (await feeCapturedOnChangedDeal(row.dealId, row.id, tx)) return false;
    const [deal] = await tx
      .select({ status: deals.status })
      .from(deals)
      .where(eq(deals.id, row.dealId))
      .limit(1);
    await recordFeeCapturedOnChangedDeal(tx, {
      dealId: row.dealId,
      status: deal?.status ?? 'CANCELLED',
      paymentId: row.id,
    });
    return true;
  });
  if (!first) return { kind: 'already_captured' };

  await afterChangedDealCapture(
    deps,
    row,
    `Payment ${paymentId} (${row.type}, ${row.amountPaise} paise) was captured for deal ${row.dealId}, ` +
      'which already has a captured payment of that type. It is marked FAILED. Refund it by hand in Razorpay.',
  );
  return { kind: 'already_captured' };
}

/**
 * After a fee was kept on a deal that had changed: alert A1 to refund it by hand, email #21 to the
 * brand, and tell both parties' open pages (SPEC 7.3, 8, 10). A failed send never undoes the record.
 */
async function afterChangedDealCapture(
  deps: PaymentsDeps,
  row: PaymentRow,
  details: string,
): Promise<void> {
  const deal = await findDeal(row.dealId);
  try {
    await alertAdmin(
      deps.env,
      FEE_CAPTURED_DEAL_CHANGED_ALERT,
      `Deal ${deal?.shortId ?? row.dealId}: ${details}`,
    );
  } catch (error) {
    logger.error({ dealId: row.dealId, error: errorName(error) }, 'fee alert failed');
    captureError(error, 'fee alert');
  }
  if (!deal) return;
  try {
    const to = await emailOf(deal.brandId);
    if (to) {
      await send(
        'FEE_CAPTURED_DEAL_CHANGED',
        to,
        { dealShortId: deal.shortId, dealTitle: deal.title ?? '', amountPaise: row.amountPaise },
        deps.env,
        { dealId: deal.id, userId: deal.brandId },
      );
    }
  } catch (error) {
    logger.error({ dealId: deal.id, error: errorName(error) }, 'fee refund email failed');
    captureError(error, 'fee refund email');
  }
  emitDealChanged(deal);
}

const errorName = (error: unknown) => (error instanceof Error ? error.message : 'unknown');
