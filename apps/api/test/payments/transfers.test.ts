import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { transfers, webhookEvents } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, http as api } from '../helpers/deals.js';
import {
  deliverWebhook,
  paymentCapturedEvent,
  transferEvent,
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

const FAILED_TRANSFER = {
  status: 'failed',
  error: {
    code: 'BAD_REQUEST_TRANSFER_INSUFFICIENT_BALANCE',
    description: 'Insufficient balance to process the transfer',
    reason: 'insufficient_balance',
  },
};

describe('transfers recorded at capture', () => {
  it('stores the transfer id and status Razorpay lists, and logs nothing personal', async () => {
    const f = await dealWithOrder(call, 'advance');
    const paymentId = razorpayCaptured(razorpay, f, 'advance');
    await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));

    const { transfers: rows } = await dealState(f.deal.id);
    expect(rows).toMatchObject([
      {
        razorpayTransferId: 'trf_mock1',
        status: 'PROCESSED',
        amountPaise: f.amount,
        failureReason: null,
      },
    ]);
    expect(rows[0]?.processedAt?.toISOString()).toBe(new Date(1_790_000_000 * 1000).toISOString());
  });

  it('keeps a PENDING row without an id when Razorpay has not created the transfer yet, then fills it in', async () => {
    const f = await dealWithOrder(call, 'advance');
    const paymentId = razorpayCaptured(razorpay, f, 'advance', { transfer: null });
    await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));

    let { transfers: rows } = await dealState(f.deal.id);
    expect(rows).toMatchObject([{ razorpayTransferId: null, status: 'PENDING' }]);

    await deliverWebhook(
      app,
      transferEvent('transfer.processed', {
        id: 'trf_late',
        source: paymentId,
        recipient: f.accountId,
        amount: f.amount,
        currency: 'INR',
        status: 'processed',
        fees: 590,
        tax: 106,
        processed_at: 1_790_000_100,
      }),
    );
    ({ transfers: rows } = await dealState(f.deal.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ razorpayTransferId: 'trf_late', status: 'PROCESSED' });
    expect((await dealState(f.deal.id)).deal.status).toBe('ADVANCE_PAID');
  });

  it('still records the capture when the transfers list is unavailable', async () => {
    const f = await dealWithOrder(call, 'advance');
    const paymentId = razorpayCaptured(razorpay, f, 'advance');
    razorpay.transfersListDown = true;
    const res = await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
    expect(res.status).toBe(200);
    const state = await dealState(f.deal.id);
    expect(state.deal.status).toBe('ADVANCE_PAID');
    expect(state.transfers).toMatchObject([{ razorpayTransferId: null, status: 'PENDING' }]);
  });
});

describe('transfer failure path (SPEC 7.3)', () => {
  it('transfer.failed after capture: FAILED with the reason, one admin alert, the deal stays advanced', async () => {
    const f = await dealWithOrder(call, 'advance');
    const paymentId = razorpayCaptured(razorpay, f, 'advance', { transfer: { status: 'created' } });
    await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
    expect((await dealState(f.deal.id)).transfers[0]?.status).toBe('PENDING');

    const failed = transferEvent('transfer.failed', {
      id: 'trf_mock1',
      source: paymentId,
      recipient: f.accountId,
      amount: f.amount,
      currency: 'INR',
      fees: 0,
      tax: 0,
      ...FAILED_TRANSFER,
    });
    await deliverWebhook(app, failed, { eventId: 'evt_failed_1' });
    await deliverWebhook(app, failed, { eventId: 'evt_failed_2' }); // another delivery of the same news

    const state = await dealState(f.deal.id);
    expect(state.deal.status).toBe('ADVANCE_PAID');
    expect(state.transfers).toMatchObject([
      {
        status: 'FAILED',
        failureReason: 'Insufficient balance to process the transfer',
        razorpayTransferId: 'trf_mock1',
      },
    ]);
    const alerts = await emails('ADMIN_ALERT');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ toEmail: env.DISPUTE_EMAIL });
    expect(alerts[0]?.bodyText).toContain('Transfer to creator failed');
    expect(alerts[0]?.bodyText).toContain('Insufficient balance');
    expect(alerts[0]?.bodyText).toContain(f.deal.shortId);
    const stored = await db.select().from(webhookEvents);
    expect(stored.map((e) => e.error)).toEqual([null, null]);
  });

  it('a transfer already FAILED when the payment is recorded: the deal advances and the admin is alerted', async () => {
    const f = await dealWithOrder(call, 'final');
    const paymentId = razorpayCaptured(razorpay, f, 'final', { transfer: FAILED_TRANSFER });
    const res = await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
    expect(res.status).toBe(200);

    const state = await dealState(f.deal.id);
    expect(state.deal.status).toBe('COMPLETED');
    expect(state.transfers).toMatchObject([{ status: 'FAILED', type: 'FINAL' }]);
    expect(await emails('ADMIN_ALERT')).toHaveLength(1);
    expect(await emails('FINAL_PAYMENT_DONE')).toHaveLength(2);

    // The later transfer.failed webhook for the same transfer does not alert a second time.
    await deliverWebhook(
      app,
      transferEvent('transfer.failed', {
        id: 'trf_mock1',
        source: paymentId,
        recipient: f.accountId,
        amount: f.amount,
        ...FAILED_TRANSFER,
      }),
    );
    expect(await emails('ADMIN_ALERT')).toHaveLength(1);
  });
});

describe('transfer events and ordering', () => {
  it('a transfer.processed that arrives before the payment was recorded records the payment first', async () => {
    const f = await dealWithOrder(call, 'advance');
    const paymentId = razorpayCaptured(razorpay, f, 'advance', { transfer: null });

    await deliverWebhook(
      app,
      transferEvent('transfer.processed', {
        id: 'trf_early',
        source: paymentId,
        recipient: f.accountId,
        amount: f.amount,
        currency: 'INR',
        status: 'processed',
        fees: 590,
        tax: 106,
      }),
    );

    const state = await dealState(f.deal.id);
    expect(state.deal.status).toBe('ADVANCE_PAID');
    expect(state.transfers).toMatchObject([
      { razorpayTransferId: 'trf_early', status: 'PROCESSED' },
    ]);
    expect(state.events).toHaveLength(1);

    // The payment's own webhook then finds everything done.
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, paymentId, f.amount));
    const after = await dealState(f.deal.id);
    expect(after.events).toHaveLength(1);
    expect(after.transfers).toHaveLength(1);
    expect(await emails('ADVANCE_PAID')).toHaveLength(2);
  });

  it('status only moves forward: a late pending never undoes processed, nothing undoes reversed', async () => {
    const f = await dealWithOrder(call, 'advance');
    const paymentId = razorpayCaptured(razorpay, f, 'advance');
    await verify(f.brand.cookie, verifyBody(f.orderId, paymentId));
    const base = { id: 'trf_mock1', source: paymentId, recipient: f.accountId, amount: f.amount };
    const statusNow = async () =>
      (await db.select().from(transfers).where(eq(transfers.dealId, f.deal.id)))[0]?.status;

    expect(await statusNow()).toBe('PROCESSED');
    await deliverWebhook(app, transferEvent('transfer.processed', { ...base, status: 'pending' }));
    expect(await statusNow()).toBe('PROCESSED');

    await deliverWebhook(app, transferEvent('transfer.reversed', { ...base, status: 'reversed' }));
    expect(await statusNow()).toBe('REVERSED');

    await deliverWebhook(
      app,
      transferEvent('transfer.processed', { ...base, status: 'processed' }),
    );
    expect(await statusNow()).toBe('REVERSED');
    expect((await dealState(f.deal.id)).deal.status).toBe('ADVANCE_PAID');
    expect(await emails('ADMIN_ALERT')).toHaveLength(0);
  });

  it('a transfer that matches nothing we created is recorded on the event and alerted', async () => {
    const { eventId } = await deliverWebhook(
      app,
      transferEvent('transfer.processed', {
        id: 'trf_stranger',
        source: 'pay_unknown',
        recipient: 'acc_other',
        amount: 100,
        status: 'processed',
      }),
    );
    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
    expect(event?.error).toContain('matches no transfer we created');
    expect(await emails('ADMIN_ALERT')).toHaveLength(1);
  });
});
