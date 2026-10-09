import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { payments } from '../../db/schema/index.js';
import { markPaymentCaptured } from '../../payments/markPaymentCaptured.js';
import { applyTransferEvent } from '../../payments/transferEvents.js';
import type { PaymentsDeps } from '../../payments/types.js';
import {
  orderPaidEventSchema,
  paymentEventSchema,
  transferEventSchema,
} from '../../razorpay/schemas.js';
import type { WebhookHandler } from '../types.js';

const MAX_REASON_LENGTH = 500;

/** payment.captured: the payment entity names its order. A payment without an order is not ours. */
export function createPaymentCapturedHandler(deps: PaymentsDeps): WebhookHandler {
  return async (payload) => {
    const { payload: body } = paymentEventSchema.parse(payload);
    const { id, order_id: orderId } = body.payment.entity;
    if (!orderId) return;
    await markPaymentCaptured(deps, orderId, id);
  };
}

/** order.paid carries both entities; it is a second route to the same idempotent capture. */
export function createOrderPaidHandler(deps: PaymentsDeps): WebhookHandler {
  return async (payload) => {
    const { payload: body } = orderPaidEventSchema.parse(payload);
    await markPaymentCaptured(deps, body.order.entity.id, body.payment.entity.id);
  };
}

/**
 * payment.failed: remembers why the last attempt failed. The deal is untouched and the
 * Razorpay order stays payable, so a retry on the same order can still succeed (SPEC 7.3).
 */
export function createPaymentFailedHandler(): WebhookHandler {
  return async (payload) => {
    const { payload: body } = paymentEventSchema.parse(payload);
    const {
      order_id: orderId,
      error_description: description,
      error_code: code,
    } = body.payment.entity;
    if (!orderId) return;

    const reason = (description ?? code ?? 'Payment failed').slice(0, MAX_REASON_LENGTH);
    // Only a payment still waiting: a captured one is never downgraded by a late failure event.
    await db
      .update(payments)
      .set({ status: 'FAILED', failureReason: reason })
      .where(and(eq(payments.razorpayOrderId, orderId), eq(payments.status, 'CREATED')));
  };
}

/** transfer.processed, transfer.failed and transfer.reversed. */
export function createTransferHandler(deps: PaymentsDeps): WebhookHandler {
  return async (payload) => {
    const { payload: body } = transferEventSchema.parse(payload);
    await applyTransferEvent(deps, body.transfer.entity);
  };
}
