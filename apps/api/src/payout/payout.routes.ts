import { mePayoutAccountSchema } from '@valueskins/shared';
import { Router } from 'express';
import { requireRole } from '../auth/guards.js';
import type { Env } from '../env/index.js';
import { type RazorpayClient } from '../razorpay/client.js';
import {
  createOrResumePayoutAccount,
  getPayoutAccount,
  refreshPayoutAccount,
} from './payoutAccount.service.js';

/** SPEC 7.2 and 16. Creators only. */
export function payoutRoutes(env: Env, razorpay: RazorpayClient): Router {
  const router = Router();
  const deps = { env, razorpay };

  router.post('/api/me/payout-account', requireRole('CREATOR'), async (req, res, next) => {
    try {
      const input = mePayoutAccountSchema.parse(req.body);
      res.json(await createOrResumePayoutAccount(deps, req.user!, input));
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/me/payout-account', requireRole('CREATOR'), async (req, res, next) => {
    try {
      res.json(await getPayoutAccount(req.user!.id));
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/me/payout-account/refresh', requireRole('CREATOR'), async (req, res, next) => {
    try {
      res.json(await refreshPayoutAccount(deps, req.user!));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
