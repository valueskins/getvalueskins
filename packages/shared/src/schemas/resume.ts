import { z } from 'zod';
import { USER_ROLES } from '../enums.js';

/** One of the last completed deals on a resume (SPEC 11). */
export const resumeDealSchema = z.object({
  counterparty: z.object({ id: z.string(), username: z.string() }),
  budgetPaise: z.number().int(),
  /** The deal title stands in for the deliverables summary (SPEC 11). */
  title: z.string(),
  completedAt: z.string(),
});

/**
 * GET /api/users/:id/resume (SPEC 11, V0_LAUNCH 2.2). For an email-only account
 * `instagramVerified` is false: the username was typed by the user and the fetched
 * profile fields are null.
 */
export const resumeResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    role: z.enum(USER_ROLES),
    username: z.string(),
    name: z.string(),
    profilePictureUrl: z.string().nullable(),
    instagramVerified: z.boolean(),
    igAccountType: z.string().nullable(),
    followersCount: z.number().nullable(),
    engagementRate: z.number().nullable(),
  }),
  completedDeals: z.array(resumeDealSchema).max(10),
});

export type ResumeResponse = z.infer<typeof resumeResponseSchema>;
