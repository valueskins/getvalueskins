import { paymentVerifyResponseSchema } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { emailLog, payments, webhookEvents } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, brandWithBilling, http as api } from '../helpers/deals.js';
import {
  checkoutSignature,
  deliverWebhook,
  orderPaidEvent,
  paymentCapturedEvent,
  paymentFailedEvent,
  paymentRow,
  verifyBody,
} from '../helpers/payments.js';
import { buildTestEnv } from '../testEnv.js';
import {
  DUE_STATUS,
  NEXT_STATUS,
  dealState,
  dealWithOrder,
  emails,
  razorpayCaptured,
  type PaymentKind,
} from './fixture.js';
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

const verify = (cookie: string, body: object) =>
  call.send('post', '/api/payments/verify', cookie, body);

const DATE_COLUMN = { commission: 'commissionPaidAt' } as const;

const EMAILS = { commission: ['COMMISSION_PAID_BRAND', 'COMMISSION_PAID_CREATOR'] } as const;

describe('POST /api/payments/verify', () => {
  it.each(['commission'] as PaymentKind[])(
    '%s: marks the payment captured, moves the deal, records the event and sends the emails',
    async (kind) => {
      const f = await dealWithOrder(call, kind);
      const paymentId = razorpayCaptured(razorpay, f, kind);

      const res = await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
      expect(res.status).toBe(200);
      const body = paymentVerifyResponseSchema.parse(res.body);
      expect(body.payment.status).toBe('CAPTURED');
      expect(body.deal.status).toBe(NEXT_STATUS[kind]);

      const state = await dealState(f.deal.id);
      expect(state.deal.status).toBe(NEXT_STATUS[kind]);
      expect(state.deal[DATE_COLUMN[kind]]?.toISOString()).toBe(NOW.toISOString());
      expect(state.events).toMatchObject([
        {
          fromStatus: DUE_STATUS[kind],
          toStatus: NEXT_STATUS[kind],
          actorType: 'SYSTEM',
          actorId: null,
        },
      ]);

      const row = await paymentRow(f.orderId);
      expect(row).toMatchObject({ status: 'CAPTURED', razorpayPaymentId: paymentId });
      expect(row?.capturedAt?.toISOString()).toBe(NOW.toISOString());

      const sent = (await db.select().from(emailLog)).filter((e) => e.dealId === f.deal.id);
      expect(sent.map((e) => e.template).sort()).toEqual([...EMAILS[kind]].sort());
      expect(sent.map((e) => e.toEmail).sort()).toEqual(
        [f.brand.user.email, f.creator.user.email].sort(),
      );
    },
  );

  describe('bad signature', () => {
    it.each([
      [
        'a different secret',
        (o: string, p: string) => checkoutSignature(o, p, 'not-the-key-secret'),
      ],
      ['another payment id', (o: string) => checkoutSignature(o, 'pay_other')],
      ['garbage', () => 'zz-not-hex'],
      ['an empty-looking signature of the wrong length', () => 'ab'],
    ])('rejects %s and changes nothing', async (_name, makeSignature) => {
      const f = await dealWithOrder(call, 'commission');
      const paymentId = razorpayCaptured(razorpay, f, 'commission');

      const res = await verify(
        f.brand.cookie,
        verifyBody(f.orderId, paymentId, makeSignature(f.orderId, paymentId)),
      );
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_SIGNATURE');

      expect((await dealState(f.deal.id)).deal.status).toBe('CONFIRMED');
      expect((await paymentRow(f.orderId))?.status).toBe('CREATED');
      expect(razorpay.fetchPaymentCalls).toHaveLength(0);
      expect(await db.select().from(emailLog)).toHaveLength(0);
    });

    it('is a 404 for an unknown order and for another brand order', async () => {
      const f = await dealWithOrder(call, 'commission');
      const paymentId = razorpayCaptured(razorpay, f, 'commission');
      const other = await brandWithBilling();
      expect((await verify(other.cookie, verifyBody(f.orderId, paymentId))).status).toBe(404);
      expect((await verify(f.brand.cookie, verifyBody('order_unknown', paymentId))).status).toBe(
        404,
      );
      expect((await verify(f.brand.cookie, { razorpay_order_id: f.orderId })).status).toBe(400);
      expect((await verify(f.creator.cookie, verifyBody(f.orderId, paymentId))).status).toBe(403);
      expect(
        (
          await call.send(
            'post',
            '/api/payments/verify',
            undefined,
            verifyBody(f.orderId, paymentId),
          )
        ).status,
      ).toBe(401);
      expect((await dealState(f.deal.id)).deal.status).toBe('CONFIRMED');
    });
  });
});

describe('verify and webhooks in any order, and repeated', () => {
  async function expectPaidOnce(f: Awaited<ReturnType<typeof dealWithOrder>>, kind: PaymentKind) {
    const state = await dealState(f.deal.id);
    expect(state.deal.status).toBe(NEXT_STATUS[kind]);
    expect(state.events).toHaveLength(1);
    // Email 4 goes to both parties.
    expect((await db.select().from(emailLog)).filter((e) => e.dealId === f.deal.id)).toHaveLength(
      2,
    );
    expect(await db.select().from(payments).where(eq(payments.dealId, f.deal.id))).toHaveLength(1);
  }

  it.each(['commission'] as PaymentKind[])('%s: verify first, then the webhook', async (kind) => {
    const f = await dealWithOrder(call, kind);
    const paymentId = razorpayCaptured(razorpay, f, kind);
    await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
    const { response } = await deliverWebhook(
      app,
      paymentCapturedEvent(f.orderId, paymentId, f.amount),
    );
    expect(response.status).toBe(200);
    await expectPaidOnce(f, kind);
    // The webhook found it already captured and did not even ask Razorpay.
    expect(razorpay.fetchPaymentCalls).toEqual([paymentId]);
  });

  it.each(['commission'] as PaymentKind[])('%s: webhook first, then verify', async (kind) => {
    const f = await dealWithOrder(call, kind);
    const paymentId = razorpayCaptured(razorpay, f, kind);
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, paymentId, f.amount));
    expect((await dealState(f.deal.id)).deal.status).toBe(NEXT_STATUS[kind]);

    const res = await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe('CAPTURED');
    await expectPaidOnce(f, kind);
  });

  it('payment.captured and order.paid together, and the same event delivered twice', async () => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    const captured = paymentCapturedEvent(f.orderId, paymentId, f.amount);

    await deliverWebhook(app, captured, { eventId: 'evt_dup' });
    await deliverWebhook(app, captured, { eventId: 'evt_dup' }); // Razorpay retry, same event id
    await deliverWebhook(app, captured, { eventId: 'evt_replay' }); // same body, a new event id
    await deliverWebhook(app, orderPaidEvent(f.orderId, paymentId, f.amount));

    await expectPaidOnce(f, 'commission');
    const stored = await db.select().from(webhookEvents);
    expect(stored.map((e) => e.error)).toEqual([null, null, null]);
    expect(stored).toHaveLength(3);
  });

  it('verify twice is a plain 200 the second time', async () => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    const first = await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
    const second = await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
    expect([first.status, second.status]).toEqual([200, 200]);
    await expectPaidOnce(f, 'commission');
  });

  it.each(['commission'] as PaymentKind[])(
    '%s: verify racing a webhook records exactly one capture',
    async (kind) => {
      const f = await dealWithOrder(call, kind);
      const paymentId = razorpayCaptured(razorpay, f, kind);
      const [res] = await Promise.all([
        verify(f.brand.cookie, verifyBody(f.orderId, paymentId)),
        deliverWebhook(app, paymentCapturedEvent(f.orderId, paymentId, f.amount)),
        deliverWebhook(app, orderPaidEvent(f.orderId, paymentId, f.amount)),
      ]);
      expect(res.status).toBe(200);
      await expectPaidOnce(f, kind);
      const events = await db.select().from(webhookEvents);
      expect(events.every((e) => e.error === null)).toBe(true);
    },
  );

  it('a webhook with a bad signature is refused and stores nothing', async () => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    const { response } = await deliverWebhook(
      app,
      paymentCapturedEvent(f.orderId, paymentId, f.amount),
      { signature: 'deadbeef'.repeat(8) },
    );
    expect(response.status).toBe(400);
    expect(await db.select().from(webhookEvents)).toHaveLength(0);
    expect((await dealState(f.deal.id)).deal.status).toBe('CONFIRMED');
    expect((await paymentRow(f.orderId))?.status).toBe('CREATED');
  });

  it('ignores a captured payment for an order we did not create', async () => {
    const { response } = await deliverWebhook(
      app,
      paymentCapturedEvent('order_not_ours', 'pay_x', 100),
    );
    expect(response.status).toBe(200);
    const [event] = await db.select().from(webhookEvents);
    expect(event).toMatchObject({ error: null });
    expect(event?.processedAt).not.toBeNull();
    expect(razorpay.fetchPaymentCalls).toHaveLength(0);
  });
});

describe('what Razorpay says is what counts', () => {
  async function untouched(f: Awaited<ReturnType<typeof dealWithOrder>>) {
    const state = await dealState(f.deal.id);
    expect(state.deal.status).toBe('CONFIRMED');
    expect(state.events).toHaveLength(0);
    expect((await paymentRow(f.orderId))?.status).toBe('CREATED');
    expect(
      (await db.select().from(emailLog)).filter((e) => e.template !== 'ADMIN_ALERT'),
    ).toHaveLength(0);
  }

  it('amount mismatch: verify answers 409 and alerts the admin; nothing is recorded', async () => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    razorpay.payments.get(paymentId)!.amount = f.amount - 100;

    const res = await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYMENT_AMOUNT_MISMATCH');
    await untouched(f);
    const alerts = await emails('ADMIN_ALERT');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ toEmail: env.DISPUTE_EMAIL });
    expect(alerts[0]?.bodyText).toContain('Payment amount mismatch');
  });

  it('amount mismatch through the webhook: recorded on the event and alerted, deal unchanged', async () => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    razorpay.payments.get(paymentId)!.amount = f.amount + 1;

    const { eventId } = await deliverWebhook(
      app,
      paymentCapturedEvent(f.orderId, paymentId, f.amount),
    );
    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
    expect(event?.error).toContain('Razorpay captured');
    expect((await dealState(f.deal.id)).deal.status).toBe('CONFIRMED');
    expect(await emails('ADMIN_ALERT')).toHaveLength(1);
  });

  it.each([
    [
      'a payment on a different order',
      (p: { order_id: string | null }) => (p.order_id = 'order_other'),
      'PAYMENT_ORDER_MISMATCH',
    ],
    [
      'a payment that is only authorized',
      (p: { status: string }) => (p.status = 'authorized'),
      'PAYMENT_NOT_CAPTURED',
    ],
    [
      'a payment in another currency',
      (p: { currency: string }) => (p.currency = 'USD'),
      'PAYMENT_AMOUNT_MISMATCH',
    ],
  ])('refuses %s', async (_name, change, code) => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    change(razorpay.payments.get(paymentId) as never);
    const res = await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(code);
    await untouched(f);
  });

  it('answers 422 for a payment Razorpay does not know', async () => {
    const f = await dealWithOrder(call, 'commission');
    const res = await verify(f.brand.cookie, verifyBody(f.orderId, 'pay_missing'));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PAYMENT_REJECTED');
    await untouched(f);
  });

  it('answers 502 when Razorpay is down, records nothing, and works when verify is repeated', async () => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    server.use(
      http.get('https://api.razorpay.com/v1/payments/:id', () =>
        HttpResponse.json({ error: { code: 'SERVER_ERROR' } }, { status: 503 }),
      ),
    );
    const down = await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
    expect(down.status).toBe(502);
    expect(down.body.error.code).toBe('RAZORPAY_UNAVAILABLE');
    await untouched(f);

    server.resetHandlers();
    server.use(...ordersHandlers(razorpay));
    expect((await verify(f.brand.cookie, verifyBody(f.orderId, paymentId))).status).toBe(200);
    expect((await dealState(f.deal.id)).deal.status).toBe('COMMISSION_PAID');
  });
});

describe('a payment on a deal in the wrong status', () => {
  it('records the real payment, leaves the deal alone and tells the admin to refund', async () => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    // The brand cancels while Checkout is open.
    const cancelled = await call.send('post', `/api/deals/${f.deal.id}/cancel`, f.brand.cookie, {
      reason: 'changed',
    });
    expect(cancelled.status).toBe(200);

    const res = await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe('CAPTURED');
    expect(res.body.deal.status).toBe('CANCELLED');

    const state = await dealState(f.deal.id);
    expect(state.deal.status).toBe('CANCELLED');
    expect(state.events).toHaveLength(1); // only the cancel
    expect(await paymentRow(f.orderId)).toMatchObject({
      status: 'CAPTURED',
      razorpayPaymentId: paymentId,
    });
    expect(await emails('COMMISSION_PAID_BRAND')).toHaveLength(0);
    const alerts = await emails('ADMIN_ALERT');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.bodyText).toContain('Refund it manually');

    // Replaying it is a no-op.
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, paymentId, f.amount));
    expect(await emails('ADMIN_ALERT')).toHaveLength(1);
  });

  it('a second captured payment for the same deal and type is marked FAILED and flagged for refund', async () => {
    const f = await dealWithOrder(call, 'commission');
    const first = razorpayCaptured(razorpay, f, 'commission', { paymentId: 'pay_first' });
    await verify(f.brand.cookie, verifyBody(f.orderId, first));

    // A second open order for the same deal and type cannot be made through the API once the
    // deal moved on, so insert it as a stale leftover would be.
    await db.insert(payments).values({
      dealId: f.deal.id,
      type: 'COMMISSION',
      amountPaise: f.amount,
      razorpayOrderId: 'order_second',
    });
    razorpayCaptured(razorpay, { ...f, orderId: 'order_second' }, 'commission', {
      paymentId: 'pay_second',
    });

    const { eventId } = await deliverWebhook(
      app,
      paymentCapturedEvent('order_second', 'pay_second', f.amount),
    );
    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
    expect(event?.error).toBeNull();
    expect(await paymentRow('order_second')).toMatchObject({ status: 'FAILED' });
    expect((await paymentRow('order_second'))?.failureReason).toContain('Duplicate capture');
    expect((await dealState(f.deal.id)).deal.status).toBe('COMMISSION_PAID');
    expect(await emails('ADMIN_ALERT')).toHaveLength(1);
  });
});

describe('payment.failed', () => {
  it('records the reason, leaves the deal unchanged and keeps the order payable', async () => {
    const f = await dealWithOrder(call, 'commission');
    const { response } = await deliverWebhook(
      app,
      paymentFailedEvent(f.orderId, 'pay_bad', 'Card declined by the bank'),
    );
    expect(response.status).toBe(200);

    expect(await paymentRow(f.orderId)).toMatchObject({
      status: 'FAILED',
      failureReason: 'Card declined by the bank',
      razorpayPaymentId: null,
    });
    const state = await dealState(f.deal.id);
    expect(state.deal.status).toBe('CONFIRMED');
    expect(state.deal.commissionPaidAt).toBeNull();
    expect(state.events).toHaveLength(0);
    expect(await db.select().from(emailLog)).toHaveLength(0);

    // The same order is still payable, and a late capture on it goes through.
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    const res = await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
    expect(res.body.deal.status).toBe('COMMISSION_PAID');
    expect((await paymentRow(f.orderId))?.failureReason).toBeNull();
  });

  it('a late successful capture is accepted even if the row says FAILED', async () => {
    const f = await dealWithOrder(call, 'commission');
    await deliverWebhook(app, paymentFailedEvent(f.orderId, 'pay_bad'));
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, paymentId, f.amount));
    expect((await dealState(f.deal.id)).deal.status).toBe('COMMISSION_PAID');
    expect((await paymentRow(f.orderId))?.status).toBe('CAPTURED');
  });

  it('never downgrades a captured payment', async () => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
    await deliverWebhook(app, paymentFailedEvent(f.orderId, 'pay_late_failure'));
    expect(await paymentRow(f.orderId)).toMatchObject({ status: 'CAPTURED', failureReason: null });
    expect((await dealState(f.deal.id)).deal.status).toBe('COMMISSION_PAID');
  });
});
