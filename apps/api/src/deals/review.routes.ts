import { dealApproveSchema, dealContentLinkSchema, dealFeedbackSchema } from '@valueskins/shared';
import { Router } from 'express';
import { requireOnboarded, requireRole } from '../auth/guards.js';
import type { ApiContext } from '../context.js';
import { buildDealDetail } from './dealDetail.js';
import { approveContent, sendFeedback, uploadContent } from './review.service.js';

/** SPEC 16: delivery and review. Content is the confirmed creator's; feedback and approval are the brand's. */
export function reviewRoutes(ctx: ApiContext): Router {
  const router = Router();

  router.post(
    '/api/deals/:id/content',
    requireRole('CREATOR'),
    requireOnboarded,
    async (req, res, next) => {
      try {
        const { link } = dealContentLinkSchema.parse(req.body);
        const deal = await uploadContent(ctx, req.user!, req.params.id, link);
        res.json({ deal: await buildDealDetail(deal, req.user!, ctx.now(), ctx.env) });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/api/deals/:id/feedback',
    requireRole('BRAND'),
    requireOnboarded,
    async (req, res, next) => {
      try {
        const { feedback } = dealFeedbackSchema.parse(req.body);
        const deal = await sendFeedback(ctx, req.user!, req.params.id, feedback);
        res.json({ deal: await buildDealDetail(deal, req.user!, ctx.now(), ctx.env) });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/api/deals/:id/approve',
    requireRole('BRAND'),
    requireOnboarded,
    async (req, res, next) => {
      try {
        dealApproveSchema.parse(req.body ?? {});
        const deal = await approveContent(ctx, req.user!, req.params.id);
        res.json({ deal: await buildDealDetail(deal, req.user!, ctx.now(), ctx.env) });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
