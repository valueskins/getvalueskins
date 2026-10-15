import { z } from 'zod';

/** The longest feedback a brand can send (the same as a dispute text, SPEC 12). */
export const DEAL_FEEDBACK_MAX = 5000;

/** POST /deals/:id/feedback: trimmed text of 1 to 5,000 characters. */
export const dealFeedbackSchema = z
  .object({
    feedback: z
      .string()
      .trim()
      .min(1, 'Write what should change')
      .max(DEAL_FEEDBACK_MAX, `Feedback can be up to ${DEAL_FEEDBACK_MAX} characters`),
  })
  .strict();

export type DealFeedbackInput = z.infer<typeof dealFeedbackSchema>;
