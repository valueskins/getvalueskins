import {
  adminCancelSchema,
  adminDealListQuerySchema,
  disputeListQuerySchema,
  disputeResolveSchema,
  markManualSchema,
} from '@valueskins/shared';
import { Router } from 'express';
import { requireAdmin } from '../auth/guards.js';
import type { ApiContext } from '../context.js';
import { buildDealDetail } from '../deals/dealDetail.js';
import { listDisputes, resolveDispute } from '../disputes/disputes.service.js';
import { adminCancelDeal, getAdminDealDetail, listAdminDeals } from './adminDeals.service.js';
import { resendEmail } from './adminEmails.service.js';
import { markTransferManual, retryTransfer } from './adminTransfers.service.js';

/**
 * SPEC 12, 16: the admin API. Every route is behind requireAdmin, which answers 404 to
 * signed-out users and non-admins alike, so the routes cannot be told apart from missing ones.
 */
export function adminRoutes(ctx: ApiContext): Router {
  const router = Router();
  router.use('/api/admin', requireAdmin);

  router.get('/api/admin/deals', async (req, res, next) => {
    try {
      res.json(await listAdminDeals(adminDealListQuerySchema.parse(req.query)));
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/admin/deals/:id', async (req, res, next) => {
    try {
      res.json(await getAdminDealDetail(ctx, req.user!, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/admin/deals/:id/cancel', async (req, res, next) => {
    try {
      const input = adminCancelSchema.parse(req.body);
      const deal = await adminCancelDeal(ctx, req.user!, req.params.id, input);
      res.json({ deal: await buildDealDetail(deal, req.user!, ctx.now()) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/admin/transfers/:id/retry', async (req, res, next) => {
    try {
      await retryTransfer(req.params.id);
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/admin/transfers/:id/mark-manual', async (req, res, next) => {
    try {
      const input = markManualSchema.parse(req.body);
      res.json({
        transfer: await markTransferManual(req.user!, req.params.id, input, ctx.now()),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/admin/emails/:id/resend', async (req, res, next) => {
    try {
      res.json(await resendEmail(ctx.env, ctx.now(), req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/admin/disputes', async (req, res, next) => {
    try {
      res.json(await listDisputes(disputeListQuerySchema.parse(req.query)));
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/admin/disputes/:id/resolve', async (req, res, next) => {
    try {
      const input = disputeResolveSchema.parse(req.body);
      res.json({ dispute: await resolveDispute(ctx, req.user!, req.params.id, input) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
