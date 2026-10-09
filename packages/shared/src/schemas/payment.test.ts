import { describe, expect, it } from 'vitest';
import { paymentTypeFromParam, paymentTypeParamSchema, paymentVerifySchema } from './payment.js';

describe('payment schemas', () => {
  it('maps the URL type to the payment enum', () => {
    expect(paymentTypeFromParam('commission')).toBe('COMMISSION');
    expect(paymentTypeFromParam('advance')).toBe('ADVANCE');
    expect(paymentTypeFromParam('final')).toBe('FINAL');
    expect(paymentTypeParamSchema.safeParse('refund').success).toBe(false);
    expect(paymentTypeParamSchema.safeParse('ADVANCE').success).toBe(false);
  });

  it('requires the three Checkout fields and nothing else', () => {
    const body = {
      razorpay_order_id: 'order_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'abc',
    };
    expect(paymentVerifySchema.safeParse(body).success).toBe(true);
    expect(paymentVerifySchema.safeParse({ ...body, extra: 1 }).success).toBe(false);
    expect(paymentVerifySchema.safeParse({ ...body, razorpay_signature: '' }).success).toBe(false);
    expect(paymentVerifySchema.safeParse({ razorpay_order_id: 'order_1' }).success).toBe(false);
  });
});
