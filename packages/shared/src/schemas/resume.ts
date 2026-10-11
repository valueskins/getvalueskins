import { z } from 'zod';
import { USER_GENDERS, USER_ROLES } from '../enums.js';

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
    /** The profile details saved once and locked (REPLACEMENT_PLAN 2.4); null until they are saved. */
    city: z.string().nullable(),
    /** The current age, worked out from the age given and when it was given. */
    age: z.number().int().nullable(),
    gender: z.enum(USER_GENDERS).nullable(),
    website: z.string().nullable(),
    pitch: z.string().nullable(),
    /** The verified email, shown because there is no chat (REPLACEMENT_PLAN 2.5). */
    contactEmail: z.string().nullable(),
    memberSince: z.string(),
  }),
  /** Across all completed deals, not only the last 10. */
  stats: z.object({
    completedDealsCount: z.number().int().min(0),
    totalValuePaise: z.number().int().min(0),
  }),
  completedDeals: z.array(resumeDealSchema).max(10),
});

export type ResumeResponse = z.infer<typeof resumeResponseSchema>;
