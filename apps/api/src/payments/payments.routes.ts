import {
  feeCapturedDealChangedMessage,
  paymentTypeParamSchema,
  paymentVerifySchema,
  type PaymentVerifyResponse,
} from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { requireOnboarded, requireRole } from '../auth/guards.js';
import { db } from '../db/client.js';
import { deals, payments } from '../db/schema/index.js';
import { notFound } from '../deals/access.js';
import { feeCapturedOnChangedDeal } from '../deals/dealEvents.js';
import { buildDealDetail } from '../deals/dealDetail.js';
import { AppError } from '../errors/AppError.js';
import { alertAdmin } from './alerts.js';
import { markPaymentCaptured } from './markPaymentCaptured.js';
import { createOrReuseOrder } from './order.service.js';
import { verifyPaymentSignature } from './signature.js';
import type { PaymentsDeps } from './types.js';

/** SPEC 16 payments endpoints (the webhook is mounted separately). Brand only. */
export function paymentRoutes(deps: PaymentsDeps): Router {
  const router = Router();
  const brandOnly = [requireRole('BRAND'), requireOnboarded];

  router.post('/api/deals/:id/payments/:type/order', ...brandOnly, async (req, res, next) => {
    try {
      const type = paymentTypeParamSchema.parse(req.params.type);
      res.json(await createOrReuseOrder(deps, req.user!, req.params.id, type));
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/payments/verify', ...brandOnly, async (req, res, next) => {
    try {
      const input = paymentVerifySchema.parse(req.body);

      const [found] = await db
        .select({ payment: payments, deal: deals })
        .from(payments)
        .innerJoin(deals, eq(deals.id, payments.dealId))
        .where(eq(payments.razorpayOrderId, input.razorpay_order_id))
        .limit(1);
      if (!found || found.deal.brandId !== req.user!.id) throw notFound();

      if (
        !verifyPaymentSignature(
          deps.env.RAZORPAY_KEY_SECRET,
          input.razorpay_order_id,
          input.razorpay_payment_id,
          input.razorpay_signature,
        )
      ) {
        throw new AppError('INVALID_SIGNATURE', 400, 'The payment signature is not valid');
      }

      try {
        await markPaymentCaptured(deps, input.razorpay_order_id, input.razorpay_payment_id);
      } catch (error) {
        if (error instanceof AppError && error.code === 'PAYMENT_AMOUNT_MISMATCH') {
          await alertAdmin(deps.env, 'Payment amount mismatch', error.internal ?? error.message);
        }
        throw error;
      }

      // The money went through but the deal had changed (SPEC 7.3). Whichever of verify and the
      // webhook recorded it, verify says so, every time it is asked.
      if (await feeCapturedOnChangedDeal(found.deal.id, found.payment.id)) {
        throw new AppError(
          'FEE_CAPTURED_DEAL_CHANGED',
          409,
          feeCapturedDealChangedMessage(found.payment.amountPaise),
        );
      }

      const [payment] = await db
        .select({ status: payments.status })
        .from(payments)
        .where(eq(payments.id, found.payment.id))
        .limit(1);
      const [deal] = await db.select().from(deals).where(eq(deals.id, found.deal.id)).limit(1);
      if (!payment || !deal) throw notFound();

      const body: PaymentVerifyResponse = {
        payment: { status: payment.status },
        deal: await buildDealDetail(deal, req.user!, deps.now(), deps.env),
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
