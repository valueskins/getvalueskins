import { z } from 'zod';
import { USER_ROLES } from '../enums.js';

/** POST /api/me/role (SPEC 6.4): once only; the API answers 409 if a role is already set. */
export const meRoleSchema = z
  .object({
    role: z.enum(USER_ROLES),
  })
  .strict();

export type MeRoleInput = z.infer<typeof meRoleSchema>;

/** Instagram handles: 1-30 characters of letters, digits, dots and underscores. */
export const INSTAGRAM_USERNAME_REGEX = /^[A-Za-z0-9._]{1,30}$/;

/**
 * POST /api/me/instagram-username (V0_LAUNCH 2.2): email-only accounts type
 * their handle. A leading "@" is stripped and the result is lowercased.
 */
export const meInstagramUsernameSchema = z
  .object({
    username: z
      .string()
      .trim()
      .transform((value) => value.replace(/^@/, '').toLowerCase())
      .pipe(z.string().regex(INSTAGRAM_USERNAME_REGEX, 'Not a valid Instagram username')),
  })
  .strict();

export type MeInstagramUsernameInput = z.infer<typeof meInstagramUsernameSchema>;

/** POST /api/me/email/verify (SPEC 6.4): the token from the emailed link. */
export const meEmailVerifySchema = z
  .object({
    token: z.string().min(20).max(200),
  })
  .strict();

export type MeEmailVerifyInput = z.infer<typeof meEmailVerifySchema>;
