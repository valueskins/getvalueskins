import type { Env } from '../../env/index.js';
import type { PaymentsDeps } from '../../payments/types.js';
import { createRazorpayClient } from '../../razorpay/client.js';
import type { WebhookHandlerRegistry } from '../types.js';
import {
  createOrderPaidHandler,
  createPaymentCapturedHandler,
  createPaymentFailedHandler,
  createTransferHandler,
} from './payments.js';

/**
 * Handlers by Razorpay event type (SPEC 7.3): the payment and transfer events. Events with no handler are stored and marked processed.
 */
export function createWebhookHandlers(
  env: Env,
  payments: PaymentsDeps = { env, razorpay: createRazorpayClient(env), now: () => new Date() },
): WebhookHandlerRegistry {
  const transfer = createTransferHandler(payments);

  return {
    'payment.captured': createPaymentCapturedHandler(payments),
    'order.paid': createOrderPaidHandler(payments),
    'payment.failed': createPaymentFailedHandler(),
    'transfer.processed': transfer,
    'transfer.failed': transfer,
    // Named in Razorpay's docs search results but not on its Route payload page: confirm it in
    // the dashboard's event list. Harmless if Razorpay never sends it.
    'transfer.reversed': transfer,
  };
}
