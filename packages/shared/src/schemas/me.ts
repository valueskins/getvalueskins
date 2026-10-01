import { z } from 'zod';
import { USER_ROLES } from '../enums.js';

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
});

/** GET /api/me (SPEC 16). */
export const meResponseSchema = z.object({
  user: meUserSchema,
  profile: meProfileSchema.nullable(),
});

export type MeUser = z.infer<typeof meUserSchema>;
export type MeProfile = z.infer<typeof meProfileSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
