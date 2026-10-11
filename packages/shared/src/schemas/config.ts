import { z } from 'zod';

/** GET /api/config (public): what the web app needs for the live breakdown preview and the sign-in options. */
export const appConfigResponseSchema = z.object({
  gstRateBps: z.number().int().min(0),
  minBudgetPaise: z.number().int().positive(),
  advancePercent: z.number().int().min(0).max(100),
  authEmailEnabled: z.boolean(),
  razorpayKeyId: z.string(),
  supportEmail: z.string(),
});

export type AppConfigResponse = z.infer<typeof appConfigResponseSchema>;
