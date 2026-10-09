import { DEAL_STATUSES } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { creatorPayoutAccounts, payments } from '../../src/db/schema/index.js';
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

async function fixture(
  status: Parameters<typeof insertDeal>[1],
  payout: Parameters<typeof creatorWithPayout>[0] = 'ACTIVE',
) {
  const brand = await brandWithBilling();
  const creator = await creatorWithPayout(payout);
  const deal = await insertDeal(brand.user.id, status, { creatorId: creator.user.id });
  const [account] = await db
    .select()
    .from(creatorPayoutAccounts)
    .where(eq(creatorPayoutAccounts.userId, creator.user.id));
  return { brand, creator, deal, accountId: account?.razorpayAccountId };
}

describe('POST /api/deals/:id/payments/:type/order', () => {
  it('commission: an order for the commission total with no transfers', async () => {
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
    const [row] = await db.select().from(payments).where(eq(payments.dealId, deal.id));
    expect(row).toMatchObject({
      type: 'COMMISSION',
      status: 'CREATED',
      razorpayOrderId: 'order_mock1',
      amountPaise: deal.commissionTotalPaise,
      razorpayPaymentId: null,
    });
  });

  it.each([
    ['advance', 'COMMISSION_PAID', 'advancePaise'],
    ['final', 'APPROVED', 'finalPaise'],
  ] as const)(
    '%s: the full amount goes to the creator linked account in the transfers array',
    async (type, status, column) => {
      const { brand, deal, accountId } = await fixture(status);
      const res = await order(brand.cookie, deal.id, type);

      expect(res.status).toBe(200);
      const amount = deal[column];
      expect(res.body.amountPaise).toBe(amount);
      expect(razorpay.orderCalls).toEqual([
        {
          amount,
          currency: 'INR',
          receipt: `${deal.shortId}-${type}`,
          notes: { deal_id: deal.id, type },
          transfers: [
            {
              account: accountId,
              amount,
              currency: 'INR',
              notes: { deal_id: deal.id, type },
              on_hold: false,
            },
          ],
        },
      ]);
    },
  );

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
    const DUE = { commission: 'CONFIRMED', advance: 'COMMISSION_PAID', final: 'APPROVED' } as const;

    it.each(Object.entries(DUE))('%s is refused in every status except %s', async (type, due) => {
      const brand = await brandWithBilling();
      const creator = await creatorWithPayout();
      for (const status of DEAL_STATUSES) {
        const deal = await insertDeal(brand.user.id, status, { creatorId: creator.user.id });
        const res = await order(brand.cookie, deal.id, type);
        if (status === due) {
          expect(res.status, `${type} in ${status}`).toBe(200);
        } else {
          expect(res.status, `${type} in ${status}`).toBe(409);
          expect(res.body.error.code).toBe('WRONG_DEAL_STATUS');
        }
      }
      // One order only, for the deal that was in the due status.
      expect(razorpay.orderCalls).toHaveLength(1);
    });
  });

  describe('advance needs the creator payout account ACTIVE', () => {
    it.each([null, 'PENDING', 'NEEDS_CLARIFICATION', 'SUSPENDED'] as const)(
      'refuses it when the account is %s',
      async (payout) => {
        const { brand, deal } = await fixture('COMMISSION_PAID', payout);
        const res = await order(brand.cookie, deal.id, 'advance');
        expect(res.status).toBe(409);
        expect(res.body.error).toMatchObject({
          code: 'CREATOR_PAYOUT_NOT_ACTIVE',
          message: 'The creator has not finished payout setup',
        });
        expect(razorpay.orderCalls).toHaveLength(0);
        expect(await db.select().from(payments)).toHaveLength(0);
      },
    );

    it('the final does not require ACTIVE: a bad account fails at the transfer, not at the order', async () => {
      const { brand, deal } = await fixture('APPROVED', 'SUSPENDED');
      expect((await order(brand.cookie, deal.id, 'final')).status).toBe(200);
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

    it('answers 502 and stores nothing when Razorpay stays down', async () => {
      const { brand, deal } = await fixture('CONFIRMED');
      razorpay.orderFailure = { status: 503, times: 99 };
      const res = await order(brand.cookie, deal.id, 'commission');
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('RAZORPAY_UNAVAILABLE');
      expect(await db.select().from(payments)).toHaveLength(0);
    });

    it('answers 422 when Razorpay rejects the order and never retries it', async () => {
      const { brand, deal } = await fixture('COMMISSION_PAID');
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
      const res = await order(brand.cookie, deal.id, 'advance');
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PAYMENT_REJECTED');
      expect(calls).toBe(1);
      expect(await db.select().from(payments)).toHaveLength(0);
    });
  });
});
