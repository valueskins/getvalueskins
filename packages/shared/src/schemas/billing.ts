import { z } from 'zod';

/** Standard 15-character Indian GSTIN format. */
export const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const meBillingSchema = z
  .object({
    billingName: z.string().min(1),
    billingAddress: z.string().min(1),
    billingState: z.string().min(1),
    gstin: z.string().regex(GSTIN_REGEX, 'Not a valid GSTIN').optional(),
  })
  .strict();

export type MeBillingInput = z.infer<typeof meBillingSchema>;
