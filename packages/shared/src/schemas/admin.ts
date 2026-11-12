import { z } from 'zod';
import { ADMIN_DEAL_ACTIONS } from '../adminActions.js';
import { DEAL_STATUSES } from '../dealStateMachine.js';
import {
  DISPUTE_STATUSES,
  EMAIL_LOG_STATUSES,
  EMAIL_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
} from '../enums.js';
import { dealDetailSchema, dealPartySchema, dealSummarySchema } from './deal.js';
import { directPaymentViewSchema } from './directPayment.js';
import { dealEventSchema } from './documents.js';
import { cursorPageQuerySchema } from './pagination.js';
import { disputeViewSchema, REFUND_REFERENCE_MAX } from './dispute.js';

/** Short ids are 8 characters, so a search longer than that can never match. */
const SHORT_ID_SEARCH_MAX = 8;

/** GET /admin/deals (SPEC 12): optional status filter and short id search. */
export const adminDealListQuerySchema = cursorPageQuerySchema
  .extend({
    status: z.enum(DEAL_STATUSES).optional(),
    q: z.string().trim().min(1).max(SHORT_ID_SEARCH_MAX).optional(),
  })
  .strict();

export type AdminDealListQuery = z.infer<typeof adminDealListQuerySchema>;

/** POST /admin/deals/:id/cancel: the resolution note is required, the refund reference is optional. */
export const adminCancelSchema = z
  .object({
    note: z.string().trim().min(1).max(5000),
    refundReference: z.string().trim().min(1).max(REFUND_REFERENCE_MAX).optional(),
  })
  .strict();

export type AdminCancelInput = z.infer<typeof adminCancelSchema>;

// ---- Responses (SPEC 12). The API returns these and the web reads them. ----

/** A row of GET /admin/deals. */
export const adminDealListItemSchema = dealSummarySchema.extend({
  creator: dealPartySchema.nullable(),
  /** A dispute on the deal is open. */
  hasOpenDispute: z.boolean(),
  /** A recorded direct payment for the stage that is due waits for the creator. */
  awaitingConfirmation: z.boolean(),
  /** From the deal's dates and the clock, never stored. */
  contentOverdue: z.boolean(),
  updatedAt: z.string(),
});

/** GET /admin/deals. `total` counts every deal that matches the filters, not only this page. */
export const adminDealListResponseSchema = z.object({
  items: z.array(adminDealListItemSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
});

/** A Razorpay payment on the deal, with the invoice it produced. */
export const adminPaymentSchema = z.object({
  id: z.string(),
  type: z.enum(PAYMENT_TYPES),
  status: z.enum(PAYMENT_STATUSES),
  amountPaise: z.number().int(),
  razorpayOrderId: z.string().nullable(),
  razorpayPaymentId: z.string().nullable(),
  failureReason: z.string().nullable(),
  capturedAt: z.string().nullable(),
  razorpayFeePaise: z.number().int().nullable(),
  razorpayTaxPaise: z.number().int().nullable(),
  invoiceNumber: z.string().nullable(),
  createdAt: z.string(),
});

/** An email of the deal, with its addresses and stored text. */
export const adminEmailSchema = z.object({
  id: z.string(),
  template: z.string(),
  subject: z.string(),
  bodyText: z.string(),
  toEmail: z.string(),
  cc: z.array(z.string()),
  status: z.enum(EMAIL_LOG_STATUSES),
  /** The provider that gave the final outcome. Null for emails from before it was recorded. */
  provider: z.enum(EMAIL_PROVIDERS).nullable(),
  error: z.string().nullable(),
  attachmentNames: z.array(z.string()),
  createdAt: z.string(),
  sentAt: z.string().nullable(),
});

/** A party of the deal with their email address, for admins only. Null email for a deleted user. */
export const adminPartySchema = dealPartySchema.extend({ email: z.string().nullable() });

export const adminDealActionSchema = z.object({
  action: z.enum(ADMIN_DEAL_ACTIONS),
  enabled: z.boolean(),
  reason: z.string().nullable(),
});

/** GET /admin/deals/:id. */
export const adminDealDetailResponseSchema = z.object({
  deal: dealDetailSchema,
  /** What the admin can do now, each with a reason when not (replaces `allowedActions` for admins). */
  adminActions: z.array(adminDealActionSchema),
  parties: z.object({ brand: adminPartySchema, creator: adminPartySchema.nullable() }),
  events: z.array(dealEventSchema),
  payments: z.array(adminPaymentSchema),
  directPayments: z.array(directPaymentViewSchema),
  emails: z.array(adminEmailSchema),
  disputes: z.array(disputeViewSchema),
});

/** GET /admin/disputes. `total` counts every dispute with the status filter, not only this page. */
export const adminDisputeListResponseSchema = z.object({
  items: z.array(disputeViewSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
});

/** The deal a dispute is about, enough for the dispute page's side card. */
export const disputeDealSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  title: z.string().nullable(),
  status: z.enum(DEAL_STATUSES),
  brand: dealPartySchema,
  creator: dealPartySchema.nullable(),
  budgetPaise: z.number().int().nullable(),
  commissionTotalPaise: z.number().int().nullable(),
  advancePaise: z.number().int().nullable(),
  finalPaise: z.number().int().nullable(),
  commissionPaidAt: z.string().nullable(),
  advancePaidAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  contentUploadDeadline: z.string().nullable(),
});

/** GET /admin/disputes/:id: the dispute, its deal, and the deal's other disputes. */
export const adminDisputeDetailResponseSchema = z.object({
  dispute: disputeViewSchema,
  deal: disputeDealSchema,
  otherDisputes: z.array(
    z.object({ id: z.string(), subject: z.string(), status: z.enum(DISPUTE_STATUSES) }),
  ),
});

/** POST /admin/emails/:id/resend. */
export const resendEmailResponseSchema = z.object({
  emailLogId: z.string(),
  status: z.enum(EMAIL_LOG_STATUSES),
  /** Attachments that could not be rebuilt and were left off. */
  missingAttachments: z.array(z.string()),
});

export type AdminDealListItem = z.infer<typeof adminDealListItemSchema>;
export type AdminDealListResponse = z.infer<typeof adminDealListResponseSchema>;
export type AdminPayment = z.infer<typeof adminPaymentSchema>;
export type AdminEmail = z.infer<typeof adminEmailSchema>;
export type AdminParty = z.infer<typeof adminPartySchema>;
export type AdminDealActionItem = z.infer<typeof adminDealActionSchema>;
export type AdminDealDetailResponse = z.infer<typeof adminDealDetailResponseSchema>;
export type AdminDisputeListResponse = z.infer<typeof adminDisputeListResponseSchema>;
export type DisputeDeal = z.infer<typeof disputeDealSchema>;
export type AdminDisputeDetailResponse = z.infer<typeof adminDisputeDetailResponseSchema>;
export type ResendEmailResponse = z.infer<typeof resendEmailResponseSchema>;
