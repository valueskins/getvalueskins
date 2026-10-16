import { ADVANCE_PERCENT, MIN_BUDGET_PAISE, type AppConfigResponse } from '@valueskins/shared';
import { Router } from 'express';
import type { ApiContext } from '../context.js';
import { launchAccessFor } from '../launch/access.js';

/**
 * Public: what the web app needs for the live breakdown preview and the sign-in options. The launch
 * flags are for the caller (an admin may see a gate open that others do not), so the response is private.
 */
export function configRoutes({ env }: ApiContext): Router {
  const router = Router();

  router.get('/api/config', (req, res) => {
    const body: AppConfigResponse = {
      gstRateBps: env.GST_RATE_BPS,
      minBudgetPaise: MIN_BUDGET_PAISE,
      advancePercent: ADVANCE_PERCENT,
      authEmailEnabled: env.AUTH_EMAIL_ENABLED,
      razorpayKeyId: env.RAZORPAY_KEY_ID,
      supportEmail: env.SUPPORT_EMAIL,
      ...launchAccessFor(env, req.user),
    };
    res.set('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    res.json(body);
  });

  return router;
}
