import {
  FEE_NOT_DUE,
  paymentTypeFromParam,
  type PaymentOrderResponse,
  type PaymentTypeParam,
} from '@valueskins/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/types.js';
import { db } from '../db/client.js';
import { payments } from '../db/schema/index.js';
import { loadOwnedDeal } from '../deals/access.js';
import type { Deal } from '../deals/stateMachine.js';
import { AppError } from '../errors/AppError.js';
import type { CreateOrderBody } from '../razorpay/client.js';
import { mapRazorpayError } from './errors.js';
import { PAYMENT_RULES, type PaymentsDeps } from './types.js';

function amountFor(deal: Deal, type: 'COMMISSION'): number {
  const amount = deal.commissionTotalPaise;
  if (amount === null || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`deal ${deal.id} has no frozen ${type} amount`);
  }
  return amount;
}

/**
 * POST /deals/:id/payments/:type/order (SPEC 7.3). The caller is the deal's brand and the
 * deal is in the status in which this payment is due. One open Order per deal and type: an
 * unpaid one (CREATED, or FAILED after a declined attempt) is reused. Only the commission is
 * paid through Razorpay: the advance and final are direct UPI payments (REPLACEMENT_PLAN 2.1),
 * recorded through the direct-payment endpoints, so `:type` can only be `commission`.
 */
export async function createOrReuseOrder(
  deps: PaymentsDeps,
  user: AuthenticatedUser,
  rawDealId: unknown,
  typeParam: PaymentTypeParam,
): Promise<PaymentOrderResponse> {
  const type = paymentTypeFromParam(typeParam);
  const rules = PAYMENT_RULES[type];
  const deal = await loadOwnedDeal(rawDealId, user.id);

  if (deal.status !== rules.from) {
    throw new AppError('WRONG_DEAL_STATUS', 409, FEE_NOT_DUE);
  }
  const amount = amountFor(deal, type);

  const lockKey = `payment-order:${deal.id}:${type}`;
  const order = await db.transaction(async (tx) => {
    // Serialises two simultaneous requests for the same deal and type, so only one Razorpay order is made.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

    const [open] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.dealId, deal.id),
          eq(payments.type, type),
          inArray(payments.status, ['CREATED', 'FAILED']),
        ),
      )
      .limit(1);
    if (open) {
      if (open.status === 'FAILED') {
        await tx
          .update(payments)
          .set({ status: 'CREATED', failureReason: null })
          .where(eq(payments.id, open.id));
      }
      return { orderId: open.razorpayOrderId, amountPaise: open.amountPaise };
    }

    const body: CreateOrderBody = {
      amount,
      currency: 'INR',
      receipt: `${deal.shortId}-${typeParam}`,
      notes: { deal_id: deal.id, type: typeParam },
    };
    let created;
    try {
      created = await deps.razorpay.createOrder(body);
    } catch (error) {
      throw mapRazorpayError(error);
    }
    await tx.insert(payments).values({
      dealId: deal.id,
      type,
      amountPaise: amount,
      razorpayOrderId: created.id,
    });
    return { orderId: created.id, amountPaise: amount };
  });

  return {
    orderId: order.orderId,
    amountPaise: order.amountPaise,
    currency: 'INR',
    keyId: deps.env.RAZORPAY_KEY_ID,
    type,
  };
}
