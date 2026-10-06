import { z } from 'zod';
import { PAYOUT_ACCOUNT_STATUSES } from '../enums.js';

export const PAN_REGEX = /^[A-Z]{5}\d{4}[A-Z]$/;
/** Individuals only: the 4th character of a person's PAN is "P" (Razorpay's stakeholder rule). */
export const INDIVIDUAL_PAN_REGEX = /^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** Razorpay accepts 5 to 20 characters for a settlement account number. */
export const BANK_ACCOUNT_NUMBER_REGEX = /^\d{5,20}$/;
export const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

/** "+91 98765-43210", "919876543210" and "09876543210" all become the 10 digits. */
export function normalizeIndianMobile(input: string): string {
  const digits = input.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+91')) return digits.slice(3);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/**
 * POST /api/me/payout-account (SPEC 7.2). `phone` is required by Razorpay's
 * linked-account API: it is sent to Razorpay and never stored by us.
 * legalName has Razorpay's minimum length of 4 (legal_business_name).
 */
export const mePayoutAccountSchema = z
  .object({
    legalName: z.string().trim().min(4).max(200),
    pan: z.string().regex(INDIVIDUAL_PAN_REGEX, 'Not a valid PAN for an individual'),
    bankAccountNumber: z.string().regex(BANK_ACCOUNT_NUMBER_REGEX, 'Not a valid account number'),
    ifsc: z.string().regex(IFSC_REGEX, 'Not a valid IFSC code'),
    accountHolderName: z.string().trim().min(1).max(255),
    phone: z
      .string()
      .transform(normalizeIndianMobile)
      .pipe(z.string().regex(INDIAN_MOBILE_REGEX, 'Not a valid Indian mobile number')),
    consent: z.literal(true),
  })
  .strict();

export type MePayoutAccountInput = z.infer<typeof mePayoutAccountSchema>;

/** One reason Razorpay gives for NEEDS_CLARIFICATION. Contains no personal data. */
export const payoutRequirementSchema = z.object({
  fieldReference: z.string(),
  reasonCode: z.string(),
  status: z.string().nullable(),
});

export type PayoutRequirement = z.infer<typeof payoutRequirementSchema>;

/** GET /api/me/payout-account and the other payout endpoints (SPEC 7.2). */
export const mePayoutAccountResponseSchema = z.object({
  payoutAccount: z
    .object({
      status: z.enum(PAYOUT_ACCOUNT_STATUSES),
      /** False while a setup was interrupted: submit the form again to resume. */
      setupComplete: z.boolean(),
      bankLast4: z.string().nullable(),
      ifsc: z.string().nullable(),
      requirements: z.array(payoutRequirementSchema),
    })
    .nullable(),
});

export type MePayoutAccountResponse = z.infer<typeof mePayoutAccountResponseSchema>;
