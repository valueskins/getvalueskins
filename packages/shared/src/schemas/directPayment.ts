import { z } from 'zod';
import { DIRECT_PAYMENT_STAGES } from '../enums.js';

/** The UPI reference (UTR): 6 to 40 characters from A-Z a-z 0-9 - / (REPLACEMENT_PLAN 2.1). */
export const UPI_REFERENCE_REGEX = /^[A-Za-z0-9\-/]{6,40}$/;
export const DIRECT_PAYMENT_NOTE_MAX = 500;
export const DIRECT_PAYMENT_REASON_MAX = 500;

export const INVALID_UPI_REFERENCE =
  'Enter the UPI reference from your payment: 6 to 40 letters, digits, hyphens or slashes.';

/** POST /deals/:id/direct-payment. The amount is never taken from the client. */
export const directPaymentRecordSchema = z
  .object({
    stage: z.enum(DIRECT_PAYMENT_STAGES),
    reference: z.string().trim().regex(UPI_REFERENCE_REGEX, INVALID_UPI_REFERENCE),
    note: z.string().trim().max(DIRECT_PAYMENT_NOTE_MAX).optional(),
  })
  .strict();

export type DirectPaymentRecordInput = z.infer<typeof directPaymentRecordSchema>;

/** POST /direct-payments/:id/not-received. */
export const directPaymentNotReceivedSchema = z
  .object({ reason: z.string().trim().min(1).max(DIRECT_PAYMENT_REASON_MAX) })
  .strict();

export type DirectPaymentNotReceivedInput = z.infer<typeof directPaymentNotReceivedSchema>;

/** POST /direct-payments/:id/confirm takes no body. */
export const directPaymentConfirmSchema = z.object({}).strict();

export const DIRECT_PAYMENT_STATUSES = ['AWAITING_CONFIRMATION', 'CONFIRMED', 'DISPUTED'] as const;
export type DirectPaymentStatus = (typeof DIRECT_PAYMENT_STATUSES)[number];

/** A record as the brand, the confirmed creator and admins see it. The UPI ID is always masked. */
export const directPaymentViewSchema = z.object({
  id: z.string(),
  stage: z.enum(DIRECT_PAYMENT_STAGES),
  amountPaise: z.number().int(),
  reference: z.string(),
  note: z.string().nullable(),
  maskedVpa: z.string(),
  recordedAt: z.string(),
  confirmedAt: z.string().nullable(),
  disputedAt: z.string().nullable(),
  disputeReason: z.string().nullable(),
  status: z.enum(DIRECT_PAYMENT_STATUSES),
});

export type DirectPaymentView = z.infer<typeof directPaymentViewSchema>;

export const DIRECT_PAYMENT_BLOCKED_REASONS = [
  'no_creator',
  'creator_has_no_upi',
  'no_consent',
  'not_due',
] as const;
export type DirectPaymentBlockedReason = (typeof DIRECT_PAYMENT_BLOCKED_REASONS)[number];

/**
 * GET /deals/:id/direct-payment, for the deal's brand only. The full UPI ID and name are here
 * only while a stage is due and the creator has consented (REPLACEMENT_PLAN 2.1).
 */
export const directPaymentInfoSchema = z.object({
  blocked: z.enum(DIRECT_PAYMENT_BLOCKED_REASONS).nullable(),
  stage: z.enum(DIRECT_PAYMENT_STAGES).nullable(),
  amountPaise: z.number().int().nullable(),
  payee: z.object({ vpa: z.string(), name: z.string() }).nullable(),
  upi: z
    .object({
      pa: z.string(),
      pn: z.string(),
      am: z.string(),
      cu: z.literal('INR'),
      tn: z.string(),
    })
    .nullable(),
  upiUri: z.string().nullable(),
  /** The live record for this stage, when the brand has already recorded a payment. */
  record: directPaymentViewSchema.nullable(),
});

export type DirectPaymentInfo = z.infer<typeof directPaymentInfoSchema>;

export const directPaymentResponseSchema = z.object({ directPayment: directPaymentViewSchema });
