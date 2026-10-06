import {
  applyPayoutStatus,
  mapActivationStatus,
  sanitizeRequirements,
} from '../../payout/status.js';
import { productStatusEventSchema } from '../../razorpay/schemas.js';
import type { Env } from '../../env/index.js';
import type { WebhookHandler } from '../types.js';

/**
 * product.route.under_review, .needs_clarification and .activated: the linked
 * account's product status changed (SPEC 7.2 and 7.3). The status update, the
 * out-of-order guard and email #16 all live in applyPayoutStatus.
 */
export function createProductStatusHandler(env: Env): WebhookHandler {
  return async (payload) => {
    const event = productStatusEventSchema.parse(payload);
    const entity = event.payload.merchant_product.entity;

    const result = await applyPayoutStatus(env, {
      razorpayAccountId: entity.merchant_id,
      status: mapActivationStatus(entity.activation_status),
      requirements: sanitizeRequirements(entity.requirements),
      observedAt: new Date(event.created_at * 1000),
    });

    if (result.kind === 'unknown_account') {
      throw new Error(`No payout account for Razorpay account ${entity.merchant_id}`);
    }
  };
}
