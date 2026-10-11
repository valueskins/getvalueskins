import { DEAL_STATUSES } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { payments } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http as api,
  insertDeal,
} from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';
import { newOrdersState, ordersHandlers, type OrdersMockState } from './razorpayOrdersMock.js';

const env = buildTestEnv();
const app = createApp(env, {
  now: () => NOW,
  razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} },
});
const call = api(app);
const server = setupServer();
let razorpay: OrdersMockState;

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
  razorpay = newOrdersState();
  server.use(...ordersHandlers(razorpay));
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await closeDb();
});

const order = (cookie: string, dealId: string, type: string) =>
  call.send('post', `/api/deals/${dealId}/payments/${type}/order`, cookie, {});

async function fixture(status: Parameters<typeof insertDeal>[1]) {
  const brand = await brandWithBilling();
  const creator = await creatorWithPayout();
  const deal = await insertDeal(brand.user.id, status, { creatorId: creator.user.id });
  return { brand, creator, deal };
}

describe('POST /api/deals/:id/payments/:type/order', () => {
  it('commission: an order for the commission total, with no transfers array', async () => {
    const { brand, deal } = await fixture('CONFIRMED');
    const res = await order(brand.cookie, deal.id, 'commission');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      orderId: 'order_mock1',
      amountPaise: deal.commissionTotalPaise,
      currency: 'INR',
      keyId: env.RAZORPAY_KEY_ID,
      type: 'COMMISSION',
    });
    expect(razorpay.orderCalls).toEqual([
      {
        amount: deal.commissionTotalPaise,
        currency: 'INR',
        receipt: `${deal.shortId}-commission`,
        notes: { deal_id: deal.id, type: 'commission' },
      },
    ]);
    expect(razorpay.orderCalls[0]).not.toHaveProperty('transfers');
    const [row] = await db.select().from(payments).where(eq(payments.dealId, deal.id));
    expect(row).toMatchObject({
      type: 'COMMISSION',
      status: 'CREATED',
      razorpayOrderId: 'order_mock1',
      amountPaise: deal.commissionTotalPaise,
      razorpayPaymentId: null,
    });
  });

  describe('advance and final: the rail changed (REPLACEMENT_PLAN 2.1)', () => {
    it.each(['advance', 'final'])(
      '%s answers 409 PAYMENT_RAIL_CHANGED to the deal brand in every status, and creates nothing',
      async (type) => {
        const brand = await brandWithBilling();
        const creator = await creatorWithPayout();
        for (const status of DEAL_STATUSES) {
          const deal = await insertDeal(brand.user.id, status, { creatorId: creator.user.id });
          const res = await order(brand.cookie, deal.id, type);
          expect(res.status, `${type} in ${status}`).toBe(409);
          expect(res.body.error.code).toBe('PAYMENT_RAIL_CHANGED');
        }
        expect(razorpay.orderAttempts).toBe(0);
        expect(await db.select().from(payments)).toHaveLength(0);
      },
    );

    it('does not reuse an advance or final order that already exists', async () => {
      const { brand, deal } = await fixture('COMMISSION_PAID');
      await db.insert(payments).values({
        dealId: deal.id,
        type: 'ADVANCE',
        amountPaise: deal.advancePaise!,
        razorpayOrderId: 'order_old_route',
      });
      const res = await order(brand.cookie, deal.id, 'advance');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_RAIL_CHANGED');
      expect(razorpay.orderAttempts).toBe(0);
    });

    it('still answers 404 to anyone but the deal brand, 403 to a creator and 401 signed out', async () => {
      const { deal, creator } = await fixture('COMMISSION_PAID');
      const otherBrand = await brandWithBilling();
      expect((await order(otherBrand.cookie, deal.id, 'advance')).status).toBe(404);
      expect((await order(creator.cookie, deal.id, 'final')).status).toBe(403);
      expect((await call.send('post', `/api/deals/${deal.id}/payments/advance/order`)).status).toBe(
        401,
      );
    });
  });

  describe('one open order per deal and type', () => {
    it('reuses an unpaid order', async () => {
      const { brand, deal } = await fixture('CONFIRMED');
      const first = await order(brand.cookie, deal.id, 'commission');
      const second = await order(brand.cookie, deal.id, 'commission');
      expect(second.body.orderId).toBe(first.body.orderId);
      expect(razorpay.orderCalls).toHaveLength(1);
      expect(await db.select().from(payments)).toHaveLength(1);
    });

    it('reuses an order whose last attempt failed and makes it open again', async () => {
      const { brand, deal } = await fixture('CONFIRMED');
      const first = await order(brand.cookie, deal.id, 'commission');
      await db
        .update(payments)
        .set({ status: 'FAILED', failureReason: 'Card declined' })
        .where(eq(payments.razorpayOrderId, first.body.orderId));

      const again = await order(brand.cookie, deal.id, 'commission');
      expect(again.body.orderId).toBe(first.body.orderId);
      expect(razorpay.orderCalls).toHaveLength(1);
      const [row] = await db.select().from(payments);
      expect(row).toMatchObject({ status: 'CREATED', failureReason: null });
    });

    it('makes one Razorpay order for simultaneous requests', async () => {
      const { brand, deal } = await fixture('CONFIRMED');
      const results = await Promise.all([
        order(brand.cookie, deal.id, 'commission'),
        order(brand.cookie, deal.id, 'commission'),
        order(brand.cookie, deal.id, 'commission'),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(new Set(results.map((r) => r.body.orderId)).size).toBe(1);
      expect(razorpay.orderCalls).toHaveLength(1);
      expect(await db.select().from(payments)).toHaveLength(1);
    });
  });

  describe('status checks', () => {
    it('commission is refused in every status except CONFIRMED', async () => {
      const brand = await brandWithBilling();
      const creator = await creatorWithPayout();
      for (const status of DEAL_STATUSES) {
        const deal = await insertDeal(brand.user.id, status, { creatorId: creator.user.id });
        const res = await order(brand.cookie, deal.id, 'commission');
        if (status === 'CONFIRMED') {
          expect(res.status, `commission in ${status}`).toBe(200);
        } else {
          expect(res.status, `commission in ${status}`).toBe(409);
          expect(res.body.error.code).toBe('WRONG_DEAL_STATUS');
        }
      }
      // One order only, for the deal that was in the due status.
      expect(razorpay.orderCalls).toHaveLength(1);
    });
  });

  describe('authorization', () => {
    it('is the deal brand only', async () => {
      const { deal, creator } = await fixture('CONFIRMED');
      const otherBrand = await brandWithBilling();
      expect((await order(otherBrand.cookie, deal.id, 'commission')).status).toBe(404);
      expect((await order(creator.cookie, deal.id, 'commission')).status).toBe(403);
      expect(
        (await call.send('post', `/api/deals/${deal.id}/payments/commission/order`)).status,
      ).toBe(401);
      expect(razorpay.orderCalls).toHaveLength(0);
    });

    it('needs a finished onboarding and a known deal and type', async () => {
      const { brand, deal } = await fixture('CONFIRMED');
      const newcomer = await createUserWithSession({ role: 'BRAND' });
      expect((await order(newcomer.cookie, deal.id, 'commission')).status).toBe(403);
      expect((await order(brand.cookie, deal.id, 'refund')).status).toBe(400);
      expect((await order(brand.cookie, 'nope', 'commission')).status).toBe(404);
      expect(
        (await order(brand.cookie, '01a11f37-1217-712d-962d-13a5004bd584', 'commission')).status,
      ).toBe(404);
    });
  });

  describe('Razorpay failures', () => {
    it('retries a 5xx and then succeeds', async () => {
      const { brand, deal } = await fixture('CONFIRMED');
      razorpay.orderFailure = { status: 503, times: 2 };
      const res = await order(brand.cookie, deal.id, 'commission');
      expect(res.status).toBe(200);
      expect(razorpay.orderCalls).toHaveLength(1);
    });

    it('retries a network error and then succeeds', async () => {
      const { brand, deal } = await fixture('CONFIRMED');
      razorpay.orderNetworkError = { times: 2 };
      const res = await order(brand.cookie, deal.id, 'commission');
      expect(res.status).toBe(200);
      expect(razorpay.orderAttempts).toBe(3);
      expect(razorpay.orderCalls).toHaveLength(1);
    });

    it('gives up after 4 attempts in all, for a network error and for a 5xx', async () => {
      const { brand, deal } = await fixture('CONFIRMED');
      razorpay.orderNetworkError = { times: 99 };
      expect((await order(brand.cookie, deal.id, 'commission')).status).toBe(502);
      expect(razorpay.orderAttempts).toBe(4);

      razorpay.orderNetworkError = null;
      razorpay.orderAttempts = 0;
      razorpay.orderFailure = { status: 503, times: 99 };
      expect((await order(brand.cookie, deal.id, 'commission')).status).toBe(502);
      expect(razorpay.orderAttempts).toBe(4);
      expect(await db.select().from(payments)).toHaveLength(0);
    });

    it('answers 502 and stores nothing when Razorpay stays down', async () => {
      const { brand, deal } = await fixture('CONFIRMED');
      razorpay.orderFailure = { status: 503, times: 99 };
      const res = await order(brand.cookie, deal.id, 'commission');
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('RAZORPAY_UNAVAILABLE');
      expect(await db.select().from(payments)).toHaveLength(0);
    });

    it('answers 422 when Razorpay rejects the order and never retries it', async () => {
      const { brand, deal } = await fixture('CONFIRMED');
      let calls = 0;
      server.use(
        http.post('https://api.razorpay.com/v1/orders', () => {
          calls += 1;
          return HttpResponse.json(
            { error: { code: 'BAD_REQUEST_ERROR', description: 'The account is not activated' } },
            { status: 400 },
          );
        }),
      );
      const res = await order(brand.cookie, deal.id, 'commission');
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PAYMENT_REJECTED');
      expect(calls).toBe(1);
      expect(await db.select().from(payments)).toHaveLength(0);
    });
  });
});
