import { mePayoutUpiSchema } from '@valueskins/shared';
import { Router } from 'express';
import { requireRole } from '../auth/guards.js';
import type { ApiContext } from '../context.js';
import { completeOnboardingIfReady } from '../onboarding/onboarding.service.js';
import { payoutUpiLimiter } from '../rateLimit/limiters.js';
import { getPayoutUpi, savePayoutUpi } from './payoutUpi.service.js';

/** SPEC 7.2 and 16. Creators only. The UPI ID in a response is always masked. */
export function payoutRoutes(ctx: ApiContext): Router {
  const router = Router();

  router.put('/api/me/payout-upi', requireRole('CREATOR'), payoutUpiLimiter, async (req, res, next) => {
    try {
      const input = mePayoutUpiSchema.parse(req.body);
      const payoutUpi = await savePayoutUpi(req.user!.id, input, ctx.now());
      res.json({ payoutUpi, onboarding: await completeOnboardingIfReady(req.user!.id) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/me/payout-upi', requireRole('CREATOR'), async (req, res, next) => {
    try {
      res.json({ payoutUpi: await getPayoutUpi(req.user!.id) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
