import { PAYMENTS_NOT_OPEN, POSTING_NOT_OPEN } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { deals, payments, webhookEvents } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
import {
  NOW,
  READY_DRAFT,
  brandWithBilling,
  creatorWithPayout,
  http as api,
  insertDeal,
} from '../helpers/deals.js';
import { deliverWebhook, verifyBody } from '../helpers/payments.js';
import { dealWithOrder, razorpayCaptured } from '../payments/fixture.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';
import { buildTestEnv } from '../testEnv.js';

type Mode = 'off' | 'admins' | 'on';

/** An app whose two launch modes are set; everything else is the test default. */
function appWith(payments: Mode, posting: Mode) {
  const app = createApp(buildTestEnv({ PAYMENTS_MODE: payments, DEAL_POSTING_MODE: posting }), {
    now: () => NOW,
    razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} },
  });
  return { app, call: api(app) };
}

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

const MODES: Array<{ mode: Mode; admin: boolean; ordinary: boolean }> = [
  { mode: 'off', admin: false, ordinary: false },
  { mode: 'admins', admin: true, ordinary: false },
  { mode: 'on', admin: true, ordinary: true },
];

describe('DEAL_POSTING_MODE: publish', () => {
  describe.each(MODES)('mode $mode', ({ mode, admin, ordinary }) => {
    it.each([
      ['an admin brand', true, admin],
      ['an ordinary brand', false, ordinary],
    ])('%s: publish is allowed = %s', async (_label, isAdmin, allowed) => {
      const { call } = appWith('on', mode);
      const brand = await brandWithBilling({ isAdmin });
      const id = (await call.send('post', '/api/deals', brand.cookie, READY_DRAFT)).body.deal.id;

      const res = await call.send('post', `/api/deals/${id}/publish`, brand.cookie, {});
      const [row] = await db.select().from(deals).where(eq(deals.id, id));
      if (allowed) {
        expect(res.status).toBe(200);
        expect(row?.status).toBe('OPEN');
      } else {
        expect(res.status).toBe(403);
        expect(res.body.error).toEqual({ code: 'POSTING_NOT_OPEN', message: POSTING_NOT_OPEN });
        expect(row?.status).toBe('DRAFT');
      }

      const detail = await call.get(`/api/deals/${id}`, brand.cookie);
      const publish = detail.body.deal.allowedActions.find(
        (a: { action: string }) => a.action === 'PUBLISH',
      );
      if (!allowed)
        expect(publish).toEqual({ action: 'PUBLISH', enabled: false, reason: POSTING_NOT_OPEN });
      else expect(publish).toBeUndefined(); // an OPEN deal has no PUBLISH action left
    });
  });

  it('exact message for the 403', () => {
    expect(POSTING_NOT_OPEN).toBe('Posting deals opens soon. We will email you when it does.');
  });

  it('drafts still work with posting off: create, edit, list, delete', async () => {
    const { call } = appWith('on', 'off');
    const brand = await brandWithBilling();
    const created = await call.send('post', '/api/deals', brand.cookie, READY_DRAFT);
    expect(created.status).toBe(201);
    const id = created.body.deal.id as string;

    const edited = await call.send('patch', `/api/deals/${id}`, brand.cookie, {
      title: 'New title',
    });
    expect(edited.status).toBe(200);
    expect(edited.body.deal.title).toBe('New title');

    const actions = edited.body.deal.allowedActions as Array<{ action: string; enabled: boolean }>;
    expect(actions.filter((a) => a.enabled).map((a) => a.action)).toEqual([
      'EDIT_DRAFT',
      'DELETE_DRAFT',
    ]);

    expect((await call.get('/api/deals/mine', brand.cookie)).status).toBe(200);
    expect((await call.send('delete', `/api/deals/${id}`, brand.cookie)).status).toBe(200);
  });

  it('the reason comes before the billing and validation reasons', async () => {
    const { call } = appWith('on', 'off');
    const brand = await createUserWithSession({ role: 'BRAND', onboardingCompletedAt: new Date() });
    const id = (await call.send('post', '/api/deals', brand.cookie, {})).body.deal.id;
    const detail = await call.get(`/api/deals/${id}`, brand.cookie);
    expect(
      detail.body.deal.allowedActions.find((a: { action: string }) => a.action === 'PUBLISH')
        .reason,
    ).toBe(POSTING_NOT_OPEN);
  });

  it('a refused publish does not use the daily limit', async () => {
    const closed = appWith('on', 'off');
    const open = appWith('on', 'on');
    const brand = await brandWithBilling();
    const id = (await closed.call.send('post', '/api/deals', brand.cookie, READY_DRAFT)).body.deal
      .id;
    for (let i = 0; i < 12; i++) {
      expect(
        (await closed.call.send('post', `/api/deals/${id}/publish`, brand.cookie, {})).status,
      ).toBe(403);
    }
    expect(
      (await open.call.send('post', `/api/deals/${id}/publish`, brand.cookie, {})).status,
    ).toBe(200);
  });

  it('another brand still gets 404, not the mode error', async () => {
    const { call } = appWith('on', 'off');
    const owner = await brandWithBilling();
    const other = await brandWithBilling();
    const id = (await call.send('post', '/api/deals', owner.cookie, READY_DRAFT)).body.deal.id;
    const res = await call.send('post', `/api/deals/${id}/publish`, other.cookie, {});
    expect(res.status).toBe(404);
  });

  it('the payments mode does not close posting', async () => {
    const { call } = appWith('off', 'on');
    const brand = await brandWithBilling();
    const id = (await call.send('post', '/api/deals', brand.cookie, READY_DRAFT)).body.deal.id;
    expect((await call.send('post', `/api/deals/${id}/publish`, brand.cookie, {})).status).toBe(
      200,
    );
  });
});

describe('PAYMENTS_MODE: fee order', () => {
  async function confirmedDeal(isAdmin: boolean) {
    const brand = await brandWithBilling({ isAdmin });
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'CONFIRMED', { creatorId: creator.user.id });
    return { brand, deal };
  }

  describe.each(MODES)('mode $mode', ({ mode, admin, ordinary }) => {
    it.each([
      ['an admin brand', true, admin],
      ['an ordinary brand', false, ordinary],
    ])('%s: ordering is allowed = %s', async (_label, isAdmin, allowed) => {
      const { call } = appWith(mode, 'on');
      const { brand, deal } = await confirmedDeal(isAdmin);

      const res = await call.send(
        'post',
        `/api/deals/${deal.id}/payments/commission/order`,
        brand.cookie,
        {},
      );
      if (allowed) {
        expect(res.status).toBe(200);
        expect(razorpay.orderCalls).toHaveLength(1);
      } else {
        expect(res.status).toBe(503);
        expect(res.body.error).toEqual({ code: 'PAYMENTS_NOT_OPEN', message: PAYMENTS_NOT_OPEN });
        expect(razorpay.orderAttempts).toBe(0);
        expect(await db.select().from(payments)).toHaveLength(0);
      }

      const detail = await call.get(`/api/deals/${deal.id}`, brand.cookie);
      const pay = detail.body.deal.allowedActions.find(
        (a: { action: string }) => a.action === 'PAY_COMMISSION',
      );
      expect(pay).toEqual(
        allowed
          ? { action: 'PAY_COMMISSION', enabled: true, reason: null }
          : { action: 'PAY_COMMISSION', enabled: false, reason: PAYMENTS_NOT_OPEN },
      );
    });
  });

  it('exact message for the 503', () => {
    expect(PAYMENTS_NOT_OPEN).toBe('Payments open soon. We will email you when they do.');
  });

  it('the posting mode does not close payments', async () => {
    const { call } = appWith('on', 'off');
    const { brand, deal } = await confirmedDeal(false);
    const res = await call.send(
      'post',
      `/api/deals/${deal.id}/payments/commission/order`,
      brand.cookie,
      {},
    );
    expect(res.status).toBe(200);
  });

  it('the creator and cancel actions are unaffected while payments are off', async () => {
    const { call } = appWith('off', 'on');
    const { brand, deal } = await confirmedDeal(false);
    const detail = await call.get(`/api/deals/${deal.id}`, brand.cookie);
    const enabled = detail.body.deal.allowedActions
      .filter((a: { enabled: boolean }) => a.enabled)
      .map((a: { action: string }) => a.action);
    expect(enabled).toEqual(['CANCEL', 'RAISE_DISPUTE']);
  });
});

describe('PAYMENTS_MODE: verify and webhook', () => {
  it('verify is not gated: a payment ordered while open can still be confirmed in admins mode', async () => {
    const open = appWith('on', 'on');
    const f = await dealWithOrder(open.call);
    const paymentId = razorpayCaptured(razorpay, f);

    const restricted = appWith('admins', 'on');
    const res = await restricted.call.send(
      'post',
      '/api/payments/verify',
      f.brand.cookie,
      verifyBody(f.orderId, paymentId),
    );
    expect(res.status).toBe(200);
    expect(res.body.deal.status).toBe('COMMISSION_PAID');
  });

  it('webhook, mode off: 404 before the signature check, nothing stored', async () => {
    const { app } = appWith('off', 'on');
    const { response } = await deliverWebhook(app, { event: 'payment.captured', payload: {} });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    expect(await db.select().from(webhookEvents)).toHaveLength(0);
  });

  it('webhook, mode off: a wrongly signed delivery is also 404, not 400', async () => {
    const { app } = appWith('off', 'on');
    const { response } = await deliverWebhook(app, { event: 'x' }, { signature: 'a'.repeat(64) });
    expect(response.status).toBe(404);
  });

  it.each(['admins', 'on'] as const)(
    'webhook, mode %s: verified, stored and processed',
    async (mode) => {
      const { app } = appWith(mode, 'on');
      const { response, eventId } = await deliverWebhook(app, {
        event: 'unrelated.event',
        payload: {},
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      expect((await db.select().from(webhookEvents)).map((r) => r.id)).toEqual([eventId]);
    },
  );

  it.each(['admins', 'on'] as const)(
    'webhook, mode %s: a bad signature is still 400',
    async (mode) => {
      const { app } = appWith(mode, 'on');
      const { response } = await deliverWebhook(app, { event: 'x' }, { signature: 'a'.repeat(64) });
      expect(response.status).toBe(400);
    },
  );

  it('the webhook mode follows payments only, not posting', async () => {
    const { app } = appWith('on', 'off');
    const { response } = await deliverWebhook(app, { event: 'unrelated.event', payload: {} });
    expect(response.status).toBe(200);
  });
});
