import { z } from 'zod';
import { USER_GENDERS, USER_ROLES } from '../enums.js';
import { ONBOARDING_STEPS } from '../onboarding.js';

/** The curated user returned by GET /api/me (dates are ISO strings on the wire). */
export const meUserSchema = z.object({
  id: z.string(),
  instagramUserId: z.string().nullable(),
  username: z.string(),
  role: z.enum(USER_ROLES).nullable(),
  isAdmin: z.boolean(),
  onboardingCompletedAt: z.string().nullable(),
  email: z.string().nullable(),
  emailVerifiedAt: z.string().nullable(),
});

/** The fetched Instagram profile (SPEC 6.1). Null on the response when no Instagram account is linked. */
export const meProfileSchema = z.object({
  username: z.string(),
  name: z.string(),
  profilePictureUrl: z.string().nullable(),
  followersCount: z.number().nullable(),
  followsCount: z.number().nullable(),
  mediaCount: z.number().nullable(),
  engagementRate: z.number().nullable(),
  instagramSyncedAt: z.string().nullable(),
  /** The Instagram bio. */
  biography: z.string().nullable().default(null),
  /** The Instagram account type, BUSINESS or MEDIA_CREATOR (SPEC 6.1). */
  accountType: z.string().nullable().default(null),
});

/**
 * The profile details saved once and locked (SPEC 6.4). Null on GET /api/me until they are saved.
 * `age` is the current age, worked out from the age given and when it was given.
 */
export const profileDetailsSchema = z.object({
  name: z.string(),
  city: z.string(),
  age: z.number().int().nullable(),
  gender: z.enum(USER_GENDERS).nullable(),
  website: z.string().nullable(),
  pitch: z.string().nullable(),
  lockedAt: z.string(),
});

/** Which onboarding steps apply, which are done, and which is next (SPEC 6.4). */
export const meOnboardingSchema = z.object({
  completed: z.boolean(),
  nextStep: z.enum(ONBOARDING_STEPS).nullable(),
  steps: z.array(
    z.object({
      id: z.enum(ONBOARDING_STEPS),
      done: z.boolean(),
      required: z.boolean(),
    }),
  ),
});

/** GET /api/me (SPEC 16). */
export const meResponseSchema = z.object({
  user: meUserSchema,
  profile: meProfileSchema.nullable(),
  profileDetails: profileDetailsSchema.nullable(),
  onboarding: meOnboardingSchema,
});

export type MeUser = z.infer<typeof meUserSchema>;
export type MeProfile = z.infer<typeof meProfileSchema>;
export type ProfileDetails = z.infer<typeof profileDetailsSchema>;
export type MeOnboarding = z.infer<typeof meOnboardingSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
