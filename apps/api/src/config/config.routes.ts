import { ADVANCE_PERCENT, MIN_BUDGET_PAISE, type AppConfigResponse } from '@valueskins/shared';
import { Router } from 'express';
import type { ApiContext } from '../context.js';

/** Public: what the web app needs for the live breakdown preview and the sign-in options. */
export function configRoutes({ env }: ApiContext): Router {
  const router = Router();

  router.get('/api/config', (_req, res) => {
    const body: AppConfigResponse = {
      gstRateBps: env.GST_RATE_BPS,
      minBudgetPaise: MIN_BUDGET_PAISE,
      advancePercent: ADVANCE_PERCENT,
      authEmailEnabled: env.AUTH_EMAIL_ENABLED,
      razorpayKeyId: env.RAZORPAY_KEY_ID,
      supportEmail: env.SUPPORT_EMAIL,
    };
    res.set('Cache-Control', 'public, max-age=60');
    res.json(body);
  });

  return router;
}
