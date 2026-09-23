import { z } from 'zod';

export const PAN_REGEX = /^[A-Z]{5}\d{4}[A-Z]$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * No `phone` field: SPEC 7.2 marks it conditional on Razorpay's linked-account
 * API, to be verified at build time — not encoded here yet.
 * No format is imposed on bankAccountNumber beyond non-empty: SPEC gives none
 * (unlike PAN/IFSC/GSTIN, which have exact formats).
 */
export const mePayoutAccountSchema = z
  .object({
    legalName: z.string().min(1),
    pan: z.string().regex(PAN_REGEX, 'Not a valid PAN'),
    bankAccountNumber: z.string().min(1),
    ifsc: z.string().regex(IFSC_REGEX, 'Not a valid IFSC code'),
    accountHolderName: z.string().min(1),
    consent: z.literal(true),
  })
  .strict();

export type MePayoutAccountInput = z.infer<typeof mePayoutAccountSchema>;
