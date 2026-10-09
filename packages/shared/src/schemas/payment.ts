import { z } from 'zod';
import { PAYMENT_STATUSES, PAYMENT_TYPES, type PaymentType } from '../enums.js';
import { dealDetailSchema } from './deal.js';

/** `:type` in POST /deals/:id/payments/:type/order (SPEC 7.3). */
export const PAYMENT_TYPE_PARAMS = ['commission', 'advance', 'final'] as const;
export const paymentTypeParamSchema = z.enum(PAYMENT_TYPE_PARAMS);
export type PaymentTypeParam = z.infer<typeof paymentTypeParamSchema>;

export function paymentTypeFromParam(param: PaymentTypeParam): PaymentType {
  return param.toUpperCase() as PaymentType;
}

/** What Razorpay Checkout needs to open for this payment. */
export const paymentOrderResponseSchema = z.object({
  orderId: z.string(),
  amountPaise: z.number().int().positive(),
  currency: z.literal('INR'),
  keyId: z.string(),
  type: z.enum(PAYMENT_TYPES),
});

export type PaymentOrderResponse = z.infer<typeof paymentOrderResponseSchema>;

/** POST /payments/verify: the three fields Checkout's success handler returns (SPEC 7.3). */
export const paymentVerifySchema = z
  .object({
    razorpay_order_id: z.string().min(1).max(255),
    razorpay_payment_id: z.string().min(1).max(255),
    razorpay_signature: z.string().min(1).max(255),
  })
  .strict();

export type PaymentVerifyInput = z.infer<typeof paymentVerifySchema>;

export const paymentVerifyResponseSchema = z.object({
  payment: z.object({ status: z.enum(PAYMENT_STATUSES) }),
  deal: dealDetailSchema,
});

export type PaymentVerifyResponse = z.infer<typeof paymentVerifyResponseSchema>;
