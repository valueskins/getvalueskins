import { z } from 'zod';
import { DEAL_ACTIONS } from '../dealActions.js';
import { directPaymentViewSchema } from './directPayment.js';
import { DEAL_STATUSES } from '../dealStateMachine.js';
import { CANCELLED_BY_ROLES } from '../enums.js';
import { dateStringSchema } from './common.js';
import { cursorPageQuerySchema } from './pagination.js';

/**
 * Largest budget a brand can type, in whole rupees. A technical bound, not a business
 * rule: it keeps `budgetPaise * COMMISSION_PERCENT_BPS` a safe integer in money.ts.
 */
export const MAX_BUDGET_RUPEES = 100_000_000_000;

/** `deals.title` is varchar(255). */
export const MAX_TITLE_LENGTH = 255;

/**
 * Shared shape for creating and updating a draft deal. All fields are optional:
 * a draft is filled in incrementally (auto-save), and only publish requires
 * everything to be present - that readiness check is `validateDealForPublish`.
 * `null` clears a field, so an emptied form input can be saved. There is no
 * description length limit (SPEC 3, rule 13).
 */
const dealFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).nullable().optional(),
    description: z.string().min(1).nullable().optional(),
    budgetRupees: z.number().int().positive().max(MAX_BUDGET_RUPEES).nullable().optional(),
    applicationDeadline: dateStringSchema.nullable().optional(),
    contentUploadDeadline: dateStringSchema.nullable().optional(),
    dealDeadline: dateStringSchema.nullable().optional(),
  })
  .strict();

export const dealCreateSchema = dealFieldsSchema;
export type DealCreateInput = z.infer<typeof dealCreateSchema>;

export const dealUpdateSchema = dealFieldsSchema;
export type DealUpdateInput = z.infer<typeof dealUpdateSchema>;

/** POST /deals/:id/publish takes no request body. */
export const dealPublishSchema = z.object({}).strict();
export type DealPublishInput = z.infer<typeof dealPublishSchema>;

/** GET /deals/feed. */
export const dealFeedQuerySchema = cursorPageQuerySchema;
export type DealFeedQuery = z.infer<typeof dealFeedQuerySchema>;

/** GET /deals/mine. `status` narrows the list. */
export const dealMineQuerySchema = cursorPageQuerySchema
  .extend({ status: z.enum(DEAL_STATUSES).optional() })
  .strict();
export type DealMineQuery = z.infer<typeof dealMineQuerySchema>;

// ---- Responses (dates are ISO strings on the wire, deadlines are YYYY-MM-DD) ----

/** A user as shown on a deal: the brand, or the confirmed creator. */
export const dealPartySchema = z.object({
  id: z.string(),
  username: z.string(),
  profilePictureUrl: z.string().nullable(),
});

export const dealSummarySchema = z.object({
  id: z.string(),
  shortId: z.string(),
  status: z.enum(DEAL_STATUSES),
  title: z.string().nullable(),
  description: z.string().nullable(),
  budgetPaise: z.number().int().nullable(),
  creatorAmountPaise: z.number().int().nullable(),
  applicationDeadline: z.string().nullable(),
  contentUploadDeadline: z.string().nullable(),
  dealDeadline: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  brand: dealPartySchema,
});

export const dealActionSchema = z.object({
  action: z.enum(DEAL_ACTIONS),
  enabled: z.boolean(),
  reason: z.string().nullable(),
});

/** GET /deals/:id (SPEC 16). The money fields are the breakdown frozen at publish (SPEC 4.1). */
export const dealDetailSchema = dealSummarySchema.extend({
  commissionBasePaise: z.number().int().nullable(),
  commissionGstPaise: z.number().int().nullable(),
  commissionTotalPaise: z.number().int().nullable(),
  advancePaise: z.number().int().nullable(),
  finalPaise: z.number().int().nullable(),
  confirmedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelledByRole: z.enum(CANCELLED_BY_ROLES).nullable(),
  cancellationReason: z.string().nullable(),
  commissionPaidAt: z.string().nullable(),
  advancePaidAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  /** Delivery (SPEC 5.5 phases 6 and 7): the latest link, the count, and the revision state. */
  contentLink: z.string().nullable(),
  contentUploadedAt: z.string().nullable(),
  uploadCount: z.number().int(),
  revisionCount: z.number().int(),
  feedback: z.string().nullable(),
  /** Every link ever uploaded, oldest first. Empty for anyone but the brand, the creator and admins. */
  contentUploads: z.array(z.object({ link: z.string(), uploadedAt: z.string() })),
  /** FIVE_REVISIONS_WARNING once the deal has had 5 revisions, else null. */
  revisionNotice: z.string().nullable(),
  creator: dealPartySchema.nullable(),
  /** Only for the deal's brand and admins. */
  creatorPayoutSet: z.boolean().nullable(),
  /** The direct UPI payment records (REPLACEMENT_PLAN 2.1), newest last. Masked UPI IDs. Empty for anyone but the brand, the confirmed creator and admins. */
  directPayments: z.array(directPaymentViewSchema),
  /** Only for the deal's brand and admins; null for everyone else. */
  applicationCount: z.number().int().nullable(),
  /** SPEC 5.1 derived flags. */
  applicationsOpen: z.boolean(),
  contentOverdue: z.boolean(),
  allowedActions: z.array(dealActionSchema),
});

export const dealDetailResponseSchema = z.object({ deal: dealDetailSchema });

export const dealListResponseSchema = z.object({
  items: z.array(dealSummarySchema),
  nextCursor: z.string().nullable(),
});

export type DealParty = z.infer<typeof dealPartySchema>;
export type DealSummary = z.infer<typeof dealSummarySchema>;
export type DealDetail = z.infer<typeof dealDetailSchema>;
export type DealDetailResponse = z.infer<typeof dealDetailResponseSchema>;
export type DealListResponse = z.infer<typeof dealListResponseSchema>;
