import { z } from 'zod';
import { APPLICATION_STATUSES } from '../enums.js';
import { dealPartySchema } from './deal.js';
import { cursorPageQuerySchema } from './pagination.js';

/** POST /deals/:id/applications - no negotiation, no message, no body fields. */
export const applicationCreateSchema = z.object({}).strict();
export type ApplicationCreateInput = z.infer<typeof applicationCreateSchema>;

/** POST /applications/:id/confirm - no body fields. */
export const applicationConfirmSchema = z.object({}).strict();
export type ApplicationConfirmInput = z.infer<typeof applicationConfirmSchema>;

/** GET /deals/:id/applications and GET /applications/mine. */
export const applicationListQuerySchema = cursorPageQuerySchema;
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;

/** An applicant as the deal's brand sees them (SPEC 5.5: hover for the resume). */
export const applicantSchema = dealPartySchema.extend({
  name: z.string(),
  followersCount: z.number().nullable(),
  engagementRate: z.number().nullable(),
  /** False for an email-only account whose username was typed, not fetched (V0_LAUNCH 2.2). */
  instagramVerified: z.boolean(),
});

export const applicationSchema = z.object({
  id: z.string(),
  dealId: z.string(),
  status: z.enum(APPLICATION_STATUSES),
  createdAt: z.string(),
});

export const dealApplicationItemSchema = applicationSchema.extend({ creator: applicantSchema });

export const dealApplicationListResponseSchema = z.object({
  items: z.array(dealApplicationItemSchema),
  nextCursor: z.string().nullable(),
});

export const myApplicationItemSchema = applicationSchema.extend({
  deal: z.object({
    id: z.string(),
    shortId: z.string(),
    status: z.string(),
    title: z.string().nullable(),
    budgetPaise: z.number().int().nullable(),
    creatorAmountPaise: z.number().int().nullable(),
    applicationDeadline: z.string().nullable(),
    brand: dealPartySchema,
  }),
});

export const myApplicationListResponseSchema = z.object({
  items: z.array(myApplicationItemSchema),
  nextCursor: z.string().nullable(),
});

export const applicationResponseSchema = z.object({ application: applicationSchema });

export type Applicant = z.infer<typeof applicantSchema>;
export type ApplicationItem = z.infer<typeof applicationSchema>;
export type DealApplicationItem = z.infer<typeof dealApplicationItemSchema>;
export type DealApplicationListResponse = z.infer<typeof dealApplicationListResponseSchema>;
export type MyApplicationItem = z.infer<typeof myApplicationItemSchema>;
export type MyApplicationListResponse = z.infer<typeof myApplicationListResponseSchema>;
