import { z } from 'zod';

/**
 * GET /api/config: what the web app needs for the live breakdown preview and the sign-in options.
 * Public, but `paymentsOpen` and `postingOpen` are for the caller (SPEC 19), so it is never shared-cached.
 */
export const appConfigResponseSchema = z.object({
  gstRateBps: z.number().int().min(0),
  minBudgetPaise: z.number().int().positive(),
  advancePercent: z.number().int().min(0).max(100),
  authEmailEnabled: z.boolean(),
  razorpayKeyId: z.string(),
  supportEmail: z.string(),
  paymentsOpen: z.boolean(),
  postingOpen: z.boolean(),
});

export type AppConfigResponse = z.infer<typeof appConfigResponseSchema>;
