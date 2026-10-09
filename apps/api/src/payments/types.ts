import type { PaymentType } from '@valueskins/shared';
import type { DealStatus } from '@valueskins/shared';
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
  /** Whether the Order carries a Route transfer to the creator. */
  transfersToCreator: boolean;
}

export const PAYMENT_RULES: Record<PaymentType, PaymentTypeRules> = {
  COMMISSION: { from: 'CONFIRMED', to: 'COMMISSION_PAID', transfersToCreator: false },
  ADVANCE: { from: 'COMMISSION_PAID', to: 'ADVANCE_PAID', transfersToCreator: true },
  FINAL: { from: 'APPROVED', to: 'COMPLETED', transfersToCreator: true },
};
