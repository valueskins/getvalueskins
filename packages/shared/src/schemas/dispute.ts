import { z } from 'zod';
import { cursorPageQuerySchema } from './pagination.js';
import { DISPUTE_STATUSES } from '../enums.js';

export const DISPUTE_SUBJECT_MAX = 150;
export const DISPUTE_TEXT_MAX = 5000;
export const REFUND_REFERENCE_MAX = 255;

/** POST /deals/:id/disputes (SPEC 12): a subject and a description. */
export const disputeCreateSchema = z
  .object({
    subject: z.string().trim().min(1).max(DISPUTE_SUBJECT_MAX),
    description: z.string().trim().min(1).max(DISPUTE_TEXT_MAX),
  })
  .strict();

export type DisputeCreateInput = z.infer<typeof disputeCreateSchema>;

/** POST /admin/disputes/:id/resolve: the resolution note is required, the Razorpay refund id is optional. */
export const disputeResolveSchema = z
  .object({
    resolution: z.string().trim().min(1).max(DISPUTE_TEXT_MAX),
    refundReference: z.string().trim().min(1).max(REFUND_REFERENCE_MAX).optional(),
  })
  .strict();

export type DisputeResolveInput = z.infer<typeof disputeResolveSchema>;

/** GET /admin/disputes. */
export const disputeListQuerySchema = cursorPageQuerySchema
  .extend({ status: z.enum(DISPUTE_STATUSES).optional() })
  .strict();

export type DisputeListQuery = z.infer<typeof disputeListQuerySchema>;

/** Who raised a dispute: only a deal's brand or its confirmed creator can. */
export const DISPUTE_RAISER_ROLES = ['BRAND', 'CREATOR'] as const;

/**
 * A dispute as the deal's own brand and creator see it on the deal page: what it is about and
 * where it stands. The text, the resolution and who resolved it stay with the admin.
 */
export const dealDisputeSchema = z.object({
  id: z.string(),
  subject: z.string(),
  status: z.enum(DISPUTE_STATUSES),
  raisedByRole: z.enum(DISPUTE_RAISER_ROLES),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export type DealDispute = z.infer<typeof dealDisputeSchema>;

/**
 * A dispute in full, as admins see it and as `POST /deals/:id/disputes` and the resolve answer it
 * (SPEC 12). A deleted raiser or resolver is "Deleted user"; `resolvedBy.id` is null for one whose
 * account no longer exists.
 */
export const disputeViewSchema = z.object({
  id: z.string(),
  dealId: z.string(),
  dealShortId: z.string(),
  dealTitle: z.string().nullable(),
  subject: z.string(),
  description: z.string(),
  status: z.enum(DISPUTE_STATUSES),
  raisedBy: z.object({ id: z.string(), username: z.string(), role: z.enum(DISPUTE_RAISER_ROLES) }),
  resolution: z.string().nullable(),
  refundReference: z.string().nullable(),
  resolvedBy: z.object({ id: z.string().nullable(), username: z.string() }).nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});

/** `POST /deals/:id/disputes` and `POST /admin/disputes/:id/resolve`. */
export const disputeResponseSchema = z.object({ dispute: disputeViewSchema });

export type DisputeView = z.infer<typeof disputeViewSchema>;
export type DisputeResponse = z.infer<typeof disputeResponseSchema>;
