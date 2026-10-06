import type { Env } from '../../env/index.js';
import type { WebhookHandlerRegistry } from '../types.js';
import { createProductStatusHandler } from './productStatus.js';

/**
 * Handlers by Razorpay event type. Only the linked-account product status
 * events exist so far; the payments prompt registers payment and transfer
 * events here. Events with no handler are stored and marked processed.
 */
export function createWebhookHandlers(env: Env): WebhookHandlerRegistry {
  const productStatus = createProductStatusHandler(env);

  return {
    'product.route.under_review': productStatus,
    'product.route.needs_clarification': productStatus,
    'product.route.activated': productStatus,
  };
}
