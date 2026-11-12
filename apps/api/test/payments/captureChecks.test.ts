import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { invoices, webhookEvents } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, http as api } from '../helpers/deals.js';
import {
  deliverWebhook,
  orderPaidEvent,
  paymentCapturedEvent,
  paymentRow,
  verifyBody,
} from '../helpers/payments.js';
import { buildTestEnv } from '../testEnv.js';
import { dealState, dealWithOrder, emails, razorpayCaptured } from './fixture.js';
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

type Fixture = Awaited<ReturnType<typeof dealWithOrder>>;

/** A fee order paid and verified with `pay_first`. */
async function paidOrder() {
  const f = await dealWithOrder(call, 'commission');
  razorpayCaptured(razorpay, f, 'commission', { paymentId: 'pay_first' });
  const res = await verify(f.brand.cookie, verifyBody(f.orderId, 'pay_first'));
  expect(res.status).toBe(200);
  return f;
}

/** The deal events of one kind, as the activity list and the admin see them. */
async function eventsOfKind(f: Fixture, kind: string) {
  const { events } = await dealState(f.deal.id);
  return events.filter((e) => (e.metadata as { kind?: string } | null)?.kind === kind);
}

describe('the stored payment again', () => {
  it('makes no Razorpay call for a repeated webhook or verify of the payment that paid the order', async () => {
    const f = await paidOrder();
    const before = razorpay.fetchPaymentCalls.length;
    expect(before).toBe(1);

    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_first', f.amount));
    await deliverWebhook(app, orderPaidEvent(f.orderId, 'pay_first', f.amount));
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_first', f.amount));
    expect((await verify(f.brand.cookie, verifyBody(f.orderId, 'pay_first'))).status).toBe(200);

    expect(razorpay.fetchPaymentCalls).toHaveLength(before);
    expect((await db.select().from(webhookEvents)).map((e) => e.error)).toEqual([null, null, null]);
    expect(await emails('ADMIN_ALERT')).toHaveLength(0);
    expect((await dealState(f.deal.id)).events.map((e) => e.metadata)).not.toContainEqual(
      expect.objectContaining({ kind: 'EXTRA_PAYMENT_ON_PAID_ORDER' }),
    );
  });
});

describe('a second captured payment on a paid order', () => {
  it('is recorded once, told to the admin once, however often it is delivered, and changes nothing else', async () => {
    const f = await paidOrder();
    const paid = await paymentRow(f.orderId);
    razorpayCaptured(razorpay, f, 'commission', { paymentId: 'pay_second' });

    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_second', f.amount));
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_second', f.amount));
    await deliverWebhook(app, orderPaidEvent(f.orderId, 'pay_second', f.amount));
    const viaVerify = await verify(f.brand.cookie, verifyBody(f.orderId, 'pay_second'));

    // Verify answers as for any paid order: the refund is by hand, not a new answer.
    expect(viaVerify.status).toBe(200);
    const extra = await eventsOfKind(f, 'EXTRA_PAYMENT_ON_PAID_ORDER');
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({
      fromStatus: 'COMMISSION_PAID',
      toStatus: 'COMMISSION_PAID',
      actorType: 'SYSTEM',
      actorId: null,
      note: null,
      metadata: {
        kind: 'EXTRA_PAYMENT_ON_PAID_ORDER',
        paymentId: paid!.id,
        razorpayOrderId: f.orderId,
        razorpayPaymentId: 'pay_first',
        extraRazorpayPaymentId: 'pay_second',
        amountPaise: f.amount,
      },
    });
    const alerts = await emails('ADMIN_ALERT');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ toEmail: env.DISPUTE_EMAIL });
    expect(alerts[0]?.subject).toContain(
      'A second payment was captured on a paid fee order, refund by hand',
    );
    expect(alerts[0]?.bodyText).toContain('pay_second');
    expect(alerts[0]?.bodyText).toContain('pay_first');
    expect(alerts[0]?.bodyText).toContain('Refund pay_second by hand in Razorpay');

    // The paid payment and the deal were never touched, and no second invoice was issued.
    expect(await paymentRow(f.orderId)).toEqual(paid);
    const state = await dealState(f.deal.id);
    expect(state.deal.status).toBe('COMMISSION_PAID');
    expect(await db.select().from(invoices).where(eq(invoices.dealId, f.deal.id))).toHaveLength(1);
    expect((await db.select().from(webhookEvents)).every((e) => e.error === null)).toBe(true);
  });

  it('is recorded once when two deliveries arrive at the same time', async () => {
    const f = await paidOrder();
    razorpayCaptured(razorpay, f, 'commission', { paymentId: 'pay_second' });

    await Promise.all([
      deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_second', f.amount)),
      deliverWebhook(app, orderPaidEvent(f.orderId, 'pay_second', f.amount)),
      verify(f.brand.cookie, verifyBody(f.orderId, 'pay_second')),
    ]);

    expect(await eventsOfKind(f, 'EXTRA_PAYMENT_ON_PAID_ORDER')).toHaveLength(1);
    expect(await emails('ADMIN_ALERT')).toHaveLength(1);
  });

  it('records each extra payment on its own', async () => {
    const f = await paidOrder();
    razorpayCaptured(razorpay, f, 'commission', { paymentId: 'pay_second' });
    razorpayCaptured(razorpay, f, 'commission', { paymentId: 'pay_third' });

    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_second', f.amount));
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_third', f.amount));
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_second', f.amount));

    expect(await eventsOfKind(f, 'EXTRA_PAYMENT_ON_PAID_ORDER')).toHaveLength(2);
    expect(await emails('ADMIN_ALERT')).toHaveLength(2);
  });

  it('ignores a payment that is not captured yet, or belongs to another order, until it is', async () => {
    const f = await paidOrder();
    razorpayCaptured(razorpay, f, 'commission', { paymentId: 'pay_pending' });
    razorpay.payments.get('pay_pending')!.status = 'authorized';
    razorpayCaptured(razorpay, f, 'commission', { paymentId: 'pay_elsewhere' });
    razorpay.payments.get('pay_elsewhere')!.order_id = 'order_other';

    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_pending', f.amount));
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_elsewhere', f.amount));
    expect(await eventsOfKind(f, 'EXTRA_PAYMENT_ON_PAID_ORDER')).toHaveLength(0);
    expect(await emails('ADMIN_ALERT')).toHaveLength(0);

    // Once Razorpay captures it, the next delivery records it.
    razorpay.payments.get('pay_pending')!.status = 'captured';
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_pending', f.amount));
    expect(await eventsOfKind(f, 'EXTRA_PAYMENT_ON_PAID_ORDER')).toHaveLength(1);
    expect(await emails('ADMIN_ALERT')).toHaveLength(1);
  });

  it('keeps the payer details out of the event and the alert', async () => {
    const f = await paidOrder();
    razorpayCaptured(razorpay, f, 'commission', { paymentId: 'pay_second' });
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_second', f.amount));

    const [event] = await eventsOfKind(f, 'EXTRA_PAYMENT_ON_PAID_ORDER');
    const text = JSON.stringify(event?.metadata) + JSON.stringify(await emails('ADMIN_ALERT'));
    expect(text).not.toMatch(/payer@|\+9198|okbank|Visa|Payer Name/);
    expect(Object.keys(event?.metadata as object).sort()).toEqual([
      'amountPaise',
      'extraRazorpayPaymentId',
      'kind',
      'paymentId',
      'razorpayOrderId',
      'razorpayPaymentId',
    ]);
  });
});

describe('an amount or currency mismatch', () => {
  /** A CONFIRMED deal whose payment Razorpay captured for the wrong amount. */
  async function mismatched(paymentId = 'pay_wrong') {
    const f = await dealWithOrder(call, 'commission');
    razorpayCaptured(razorpay, f, 'commission', { paymentId });
    razorpay.payments.get(paymentId)!.amount = f.amount - 100;
    return f;
  }

  async function expectRecordedOnce(f: Fixture, paymentId = 'pay_wrong') {
    const events = await eventsOfKind(f, 'FEE_AMOUNT_MISMATCH');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      fromStatus: 'CONFIRMED',
      toStatus: 'CONFIRMED',
      actorType: 'SYSTEM',
      metadata: {
        kind: 'FEE_AMOUNT_MISMATCH',
        razorpayOrderId: f.orderId,
        razorpayPaymentId: paymentId,
        expectedAmountPaise: f.amount,
        expectedCurrency: 'INR',
        receivedAmountPaise: f.amount - 100,
        receivedCurrency: 'INR',
      },
    });
    const alerts = await emails('ADMIN_ALERT');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.subject).toContain('Payment amount mismatch');
    expect(alerts[0]?.bodyText).toContain('Razorpay captured');
    // Rejected: the deal and the payment are as they were.
    expect((await dealState(f.deal.id)).deal.status).toBe('CONFIRMED');
    expect((await paymentRow(f.orderId))?.status).toBe('CREATED');
  }

  it('through verify and then the webhook: one event, one alert, still rejected both times', async () => {
    const f = await mismatched();
    const first = await verify(f.brand.cookie, verifyBody(f.orderId, 'pay_wrong'));
    const { eventId } = await deliverWebhook(
      app,
      paymentCapturedEvent(f.orderId, 'pay_wrong', f.amount),
    );
    const second = await verify(f.brand.cookie, verifyBody(f.orderId, 'pay_wrong'));

    for (const res of [first, second]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_AMOUNT_MISMATCH');
    }
    const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
    expect(row?.error).toContain('Razorpay captured');
    await expectRecordedOnce(f);
  });

  it('through the webhook and then verify: one event, one alert', async () => {
    const f = await mismatched();
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_wrong', f.amount));
    await deliverWebhook(app, orderPaidEvent(f.orderId, 'pay_wrong', f.amount));
    const res = await verify(f.brand.cookie, verifyBody(f.orderId, 'pay_wrong'));

    expect(res.status).toBe(409);
    expect((await db.select().from(webhookEvents)).every((e) => e.error !== null)).toBe(true);
    await expectRecordedOnce(f);
  });

  it('through verify and the webhook at the same time: one event, one alert', async () => {
    const f = await mismatched();
    const [res] = await Promise.all([
      verify(f.brand.cookie, verifyBody(f.orderId, 'pay_wrong')),
      deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_wrong', f.amount)),
      deliverWebhook(app, orderPaidEvent(f.orderId, 'pay_wrong', f.amount)),
    ]);

    expect(res.status).toBe(409);
    await expectRecordedOnce(f);
  });

  it('records a different mismatching payment on the same order on its own', async () => {
    const f = await mismatched('pay_wrong');
    razorpayCaptured(razorpay, f, 'commission', { paymentId: 'pay_wrong_too' });
    razorpay.payments.get('pay_wrong_too')!.currency = 'USD';

    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_wrong', f.amount));
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_wrong_too', f.amount));
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_wrong_too', f.amount));

    const events = await eventsOfKind(f, 'FEE_AMOUNT_MISMATCH');
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      metadata: { razorpayPaymentId: 'pay_wrong_too', receivedCurrency: 'USD' },
    });
    expect(await emails('ADMIN_ALERT')).toHaveLength(2);
  });

  it('still accepts the right payment afterwards', async () => {
    const f = await mismatched();
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_wrong', f.amount));
    razorpayCaptured(razorpay, f, 'commission', { paymentId: 'pay_right' });
    const res = await verify(f.brand.cookie, verifyBody(f.orderId, 'pay_right'));

    expect(res.status).toBe(200);
    expect((await paymentRow(f.orderId))?.razorpayPaymentId).toBe('pay_right');
    expect((await dealState(f.deal.id)).deal.status).toBe('COMMISSION_PAID');
    expect(await eventsOfKind(f, 'FEE_AMOUNT_MISMATCH')).toHaveLength(1);
  });

  it('sends the one alert even when the webhook is the first to see it, and keeps the payer details out', async () => {
    const f = await mismatched();
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, 'pay_wrong', f.amount));
    const text =
      JSON.stringify((await eventsOfKind(f, 'FEE_AMOUNT_MISMATCH'))[0]?.metadata) +
      JSON.stringify(await emails('ADMIN_ALERT'));
    expect(text).not.toMatch(/payer@|\+9198|okbank|Visa|Payer Name/);
    expect(await emails('ADMIN_ALERT')).toHaveLength(1);
  });
});
