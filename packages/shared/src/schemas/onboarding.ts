import { z } from 'zod';

/** POST /api/me/email/verify (SPEC 6.4): the token from the emailed link. */
export const meEmailVerifySchema = z
  .object({
    token: z.string().min(20).max(200),
  })
  .strict();

export type MeEmailVerifyInput = z.infer<typeof meEmailVerifySchema>;
