import { z } from 'zod';
import { USER_ROLES } from '../enums.js';

/**
 * POST /api/dev/login (SPEC 6.2), non-production only. `admin` makes the new user an admin; like
 * the role it applies only when the user is created.
 */
export const devLoginSchema = z
  .object({
    username: z.string().min(1).max(255),
    role: z.enum(USER_ROLES),
    admin: z.boolean().optional(),
  })
  .strict();

export type DevLoginInput = z.infer<typeof devLoginSchema>;

/** POST /api/auth/email/start (SPEC 6.5, V0_LAUNCH 2.1) */
export const emailLoginStartSchema = z
  .object({
    email: z.string().email(),
  })
  .strict();

export type EmailLoginStartInput = z.infer<typeof emailLoginStartSchema>;

/** POST /api/auth/email/verify (SPEC 6.5, V0_LAUNCH 2.1) */
export const emailLoginVerifySchema = z
  .object({
    email: z.string().email(),
    code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
  })
  .strict();

export type EmailLoginVerifyInput = z.infer<typeof emailLoginVerifySchema>;
