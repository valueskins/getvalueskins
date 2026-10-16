import {
  applicationConfirmSchema,
  applicationCreateSchema,
  applicationListQuerySchema,
} from '@valueskins/shared';
import { Router } from 'express';
import { requireOnboarded, requireRole } from '../auth/guards.js';
import type { ApiContext } from '../context.js';
import { buildDealDetail } from '../deals/dealDetail.js';
import {
  applyToDeal,
  confirmApplication,
  listDealApplications,
  listMyApplications,
} from './applications.service.js';

/** SPEC 16 applications endpoints. */
export function applicationRoutes(ctx: ApiContext): Router {
  const router = Router();

  router.post(
    '/api/deals/:id/applications',
    requireRole('CREATOR'),
    requireOnboarded,
    async (req, res, next) => {
      try {
        applicationCreateSchema.parse(req.body ?? {});
        const application = await applyToDeal(ctx, req.user!, req.params.id, res);
        res.status(201).json({ application });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/api/deals/:id/applications',
    requireRole('BRAND'),
    requireOnboarded,
    async (req, res, next) => {
      try {
        const query = applicationListQuerySchema.parse(req.query);
        res.json(await listDealApplications(req.user!, req.params.id, query));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/api/applications/mine',
    requireRole('CREATOR'),
    requireOnboarded,
    async (req, res, next) => {
      try {
        res.json(await listMyApplications(req.user!, applicationListQuerySchema.parse(req.query)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/api/applications/:id/confirm',
    requireRole('BRAND'),
    requireOnboarded,
    async (req, res, next) => {
      try {
        applicationConfirmSchema.parse(req.body ?? {});
        const deal = await confirmApplication(ctx, req.user!, req.params.id);
        res.json({ deal: await buildDealDetail(deal, req.user!, ctx.now(), ctx.env) });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
