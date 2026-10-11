import type { DealStatus, PaymentType } from '@valueskins/shared';
import type { Env } from '../env/index.js';
import type { RazorpayClient } from '../razorpay/client.js';

/** What the payment code needs: config, the shared Razorpay client, and the clock. */
export interface PaymentsDeps {
  env: Env;
  razorpay: RazorpayClient;
  now: () => Date;
}

export interface PaymentTypeRules {
  /** The deal status in which this payment is due, and the one it moves the deal to (SPEC 5.2, 7.3). */
  from: DealStatus;
  to: DealStatus;
}

/** Only the ValueSkins fee goes through Razorpay. The advance and final are direct UPI payments. */
export const PAYMENT_RULES: Record<PaymentType, PaymentTypeRules> = {
  COMMISSION: { from: 'CONFIRMED', to: 'COMMISSION_PAID' },
};
