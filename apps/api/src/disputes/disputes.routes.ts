import { disputeCreateSchema } from '@valueskins/shared';
import { Router } from 'express';
import { requireOnboarded, requireUser } from '../auth/guards.js';
import type { ApiContext } from '../context.js';
import { raiseDispute } from './disputes.service.js';

/** SPEC 12, 16: the deal's brand or its confirmed creator raises a dispute. */
export function disputeRoutes(ctx: ApiContext): Router {
  const router = Router();

  router.post('/api/deals/:id/disputes', requireUser, requireOnboarded, async (req, res, next) => {
    try {
      const input = disputeCreateSchema.parse(req.body);
      const dispute = await raiseDispute(ctx, req.user!, req.params.id, input, res);
      res.status(201).json({ dispute });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
