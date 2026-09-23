import { z } from 'zod';

/** POST /deals/:id/feedback — no length limit is specified in SPEC. */
export const dealFeedbackSchema = z
  .object({
    feedback: z.string().min(1),
  })
  .strict();

export type DealFeedbackInput = z.infer<typeof dealFeedbackSchema>;
