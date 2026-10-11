import { z } from 'zod';
import {
  UPI_NAME_MAX,
  UPI_NAME_MIN,
  UPI_VPA_REGEX,
  looksLikeBankAccount,
  looksLikeIfsc,
  looksLikePan,
} from '../payoutUpi.js';
import { meOnboardingSchema } from './me.js';

export const NOT_A_UPI_ID_BANK_ACCOUNT =
  'That looks like a bank account number. Enter a UPI ID like name@bank.';
export const NOT_A_UPI_ID_PAN = 'That looks like a PAN. Enter a UPI ID like name@bank.';
export const NOT_A_UPI_ID_IFSC = 'That looks like an IFSC code. Enter a UPI ID like name@bank.';
export const INVALID_UPI_ID = 'Not a valid UPI ID. It looks like name@bank.';
export const NAME_LOOKS_LIKE_BANK_DETAILS =
  'Enter the name on the account as your UPI app shows it, not a number or code.';
export const INVALID_UPI_NAME =
  'Enter the name on the account using letters, spaces, dots, hyphens and apostrophes.';

/** Letters in any script, then letters, spaces and . ' - (a name as a UPI app shows it). */
const NAME_REGEX = /^\p{L}[\p{L}\p{M} .'’-]*$/u;

/**
 * PUT /api/me/payout-upi (REPLACEMENT_PLAN 2.1). The messages name the problem and never echo
 * the input. A bank account number, PAN or IFSC code gets its own message before the generic one.
 */
export const mePayoutUpiSchema = z
  .object({
    vpa: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        if (looksLikeBankAccount(value)) {
          ctx.addIssue({ code: 'custom', message: NOT_A_UPI_ID_BANK_ACCOUNT });
        } else if (looksLikePan(value)) {
          ctx.addIssue({ code: 'custom', message: NOT_A_UPI_ID_PAN });
        } else if (looksLikeIfsc(value)) {
          ctx.addIssue({ code: 'custom', message: NOT_A_UPI_ID_IFSC });
        } else if (!UPI_VPA_REGEX.test(value)) {
          ctx.addIssue({ code: 'custom', message: INVALID_UPI_ID });
        }
      })
      .transform((value) => value.toLowerCase()),
    name: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        if (looksLikeBankAccount(value) || looksLikePan(value) || looksLikeIfsc(value)) {
          ctx.addIssue({ code: 'custom', message: NAME_LOOKS_LIKE_BANK_DETAILS });
        } else if (
          value.length < UPI_NAME_MIN ||
          value.length > UPI_NAME_MAX ||
          !NAME_REGEX.test(value)
        ) {
          ctx.addIssue({ code: 'custom', message: INVALID_UPI_NAME });
        }
      }),
    consent: z.literal(true),
  })
  .strict();

export type MePayoutUpiInput = z.infer<typeof mePayoutUpiSchema>;

/** What a creator sees of their own payout details: the UPI ID is always masked. */
export const payoutUpiViewSchema = z.object({
  maskedVpa: z.string(),
  name: z.string(),
  consentAt: z.string(),
});

export type PayoutUpiView = z.infer<typeof payoutUpiViewSchema>;

/** GET /api/me/payout-upi. */
export const mePayoutUpiResponseSchema = z.object({
  payoutUpi: payoutUpiViewSchema.nullable(),
});

export type MePayoutUpiResponse = z.infer<typeof mePayoutUpiResponseSchema>;

/** PUT /api/me/payout-upi: the saved details and the refreshed onboarding state. */
export const mePayoutUpiSaveResponseSchema = z.object({
  payoutUpi: payoutUpiViewSchema,
  onboarding: meOnboardingSchema,
});

export type MePayoutUpiSaveResponse = z.infer<typeof mePayoutUpiSaveResponseSchema>;
