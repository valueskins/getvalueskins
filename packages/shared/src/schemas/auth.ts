import { z } from 'zod';
import { USER_ROLES } from '../enums.js';

/** POST /api/dev/login (SPEC 6.2) — non-production only. */
export const devLoginSchema = z
  .object({
    username: z.string().min(1).max(255),
    role: z.enum(USER_ROLES),
  })
  .strict();

export type DevLoginInput = z.infer<typeof devLoginSchema>;
