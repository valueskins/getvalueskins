import { z } from 'zod';

export const meEmailSchema = z
  .object({
    email: z.string().email(),
  })
  .strict();

export type MeEmailInput = z.infer<typeof meEmailSchema>;
