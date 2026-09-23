import { z } from 'zod';

export const disputeCreateSchema = z
  .object({
    subject: z.string().min(1),
    description: z.string().min(1),
  })
  .strict();

export type DisputeCreateInput = z.infer<typeof disputeCreateSchema>;
