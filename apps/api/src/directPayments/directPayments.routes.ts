import {
  directPaymentConfirmSchema,
  directPaymentNotReceivedSchema,
  directPaymentRecordSchema,
} from '@valueskins/shared';
import { Router } from 'express';
import { requireOnboarded, requireRole } from '../auth/guards.js';
import type { ApiContext } from '../context.js';
import { buildDealDetail } from '../deals/dealDetail.js';
import { directPaymentDecisionLimiter, directPaymentRecordLimiter } from '../rateLimit/limiters.js';
import {
  confirmDirectPayment,
  getDirectPaymentInfo,
  markNotReceived,
  recordDirectPayment,
} from './directPayments.service.js';

/**
 * SPEC 16: direct brand-to-creator UPI payments (REPLACEMENT_PLAN 2.1). The brand reads what to
 * pay and records the UPI reference; only the deal's confirmed creator confirms it arrived or
 * says it did not. Recording never changes the deal's status.
 */
export function directPaymentRoutes(ctx: ApiContext): Router {
  const router = Router();

  router.get(
    '/api/deals/:id/direct-payment',
    requireRole('BRAND'),
    requireOnboarded,
    async (req, res, next) => {
      try {
        const info = await getDirectPaymentInfo(req.user!, req.params.id);
        // It can carry the creator's full UPI ID: never cached.
        res.set('Cache-Control', 'private, no-store');
        res.json(info);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/api/deals/:id/direct-payment',
    requireRole('BRAND'),
    requireOnboarded,
    directPaymentRecordLimiter,
    async (req, res, next) => {
      try {
        const input = directPaymentRecordSchema.parse(req.body);
        const directPayment = await recordDirectPayment(ctx, req.user!, req.params.id, input);
        res.status(201).json({ directPayment });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/api/direct-payments/:id/confirm',
    requireRole('CREATOR'),
    requireOnboarded,
    directPaymentDecisionLimiter,
    async (req, res, next) => {
      try {
        directPaymentConfirmSchema.parse(req.body ?? {});
        const { directPayment, deal } = await confirmDirectPayment(ctx, req.user!, req.params.id);
        res.json({ directPayment, deal: await buildDealDetail(deal, req.user!, ctx.now()) });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/api/direct-payments/:id/not-received',
    requireRole('CREATOR'),
    requireOnboarded,
    directPaymentDecisionLimiter,
    async (req, res, next) => {
      try {
        const input = directPaymentNotReceivedSchema.parse(req.body);
        const { directPayment, deal } = await markNotReceived(ctx, req.user!, req.params.id, input);
        res.json({ directPayment, deal: await buildDealDetail(deal, req.user!, ctx.now()) });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
