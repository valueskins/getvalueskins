import { z } from 'zod';

export const dealCancelSchema = z
  .object({
    reason: z.string().min(1),
  })
  .strict();

export type DealCancelInput = z.infer<typeof dealCancelSchema>;
