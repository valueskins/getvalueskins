import {
  dealCancelSchema,
  dealCreateSchema,
  dealFeedQuerySchema,
  dealMineQuerySchema,
  dealPublishSchema,
  dealUpdateSchema,
} from '@valueskins/shared';
import { Router, type Request, type Response } from 'express';
import { requireOnboarded, requireRole } from '../auth/guards.js';
import type { ApiContext } from '../context.js';
import { loadViewableDeal } from './access.js';
import { buildDealDetail } from './dealDetail.js';
import { createDraft, deleteDraft, updateDraft } from './drafts.service.js';
import { cancelDeal, publishDeal } from './lifecycle.service.js';
import { listFeed, listMine } from './queries.service.js';
import type { Deal } from './stateMachine.js';

/** SPEC 16 deals endpoints. Brand-only routes also require a finished onboarding (billing included). */
export function dealRoutes(ctx: ApiContext): Router {
  const router = Router();
  const brandOnly = [requireRole('BRAND'), requireOnboarded];
  const creatorOnly = [requireRole('CREATOR'), requireOnboarded];

  async function detail(req: Request, deal: Deal) {
    return { deal: await buildDealDetail(deal, req.user!, ctx.now(), ctx.env) };
  }

  router.post('/api/deals', ...brandOnly, async (req, res, next) => {
    try {
      const deal = await createDraft(req.user!.id, dealCreateSchema.parse(req.body));
      res.status(201).json(await detail(req, deal));
    } catch (error) {
      next(error);
    }
  });

  // Registered before /api/deals/:id so "feed" and "mine" are not read as ids.
  router.get('/api/deals/feed', ...creatorOnly, async (req, res, next) => {
    try {
      res.json(await listFeed(ctx, req.user!, dealFeedQuerySchema.parse(req.query)));
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/deals/mine', requireOnboarded, async (req, res, next) => {
    try {
      res.json(await listMine(ctx, req.user!, dealMineQuerySchema.parse(req.query)));
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/deals/:id', requireOnboarded, async (req, res, next) => {
    try {
      const deal = await loadViewableDeal(req.params.id, req.user!);
      res.json(await detail(req, deal));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/api/deals/:id', ...brandOnly, async (req, res, next) => {
    try {
      const deal = await updateDraft(req.user!.id, req.params.id, dealUpdateSchema.parse(req.body));
      res.json(await detail(req, deal));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/api/deals/:id', ...brandOnly, async (req, res, next) => {
    try {
      await deleteDraft(req.user!.id, req.params.id);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/deals/:id/publish', ...brandOnly, async (req: Request, res: Response, next) => {
    try {
      dealPublishSchema.parse(req.body ?? {});
      const deal = await publishDeal(ctx, req.user!, req.params.id, res);
      res.json(await detail(req, deal));
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/deals/:id/cancel', ...brandOnly, async (req, res, next) => {
    try {
      const { reason } = dealCancelSchema.parse(req.body);
      const deal = await cancelDeal(ctx, req.user!, req.params.id, reason);
      res.json(await detail(req, deal));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
