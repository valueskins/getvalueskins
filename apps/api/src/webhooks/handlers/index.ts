import type { Env } from '../../env/index.js';
import type { PaymentsDeps } from '../../payments/types.js';
import { createRazorpayClient } from '../../razorpay/client.js';
import type { WebhookHandlerRegistry } from '../types.js';
import {
  createOrderPaidHandler,
  createPaymentCapturedHandler,
  createPaymentFailedHandler,
} from './payments.js';

/**
 * Handlers by Razorpay event type (SPEC 7.3): the payment events. Events with no handler are stored and marked processed.
 */
export function createWebhookHandlers(
  env: Env,
  payments: PaymentsDeps = { env, razorpay: createRazorpayClient(env), now: () => new Date() },
): WebhookHandlerRegistry {
  return {
    'payment.captured': createPaymentCapturedHandler(payments),
    'order.paid': createOrderPaidHandler(payments),
    'payment.failed': createPaymentFailedHandler(),
  };
}
