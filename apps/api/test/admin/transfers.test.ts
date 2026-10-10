import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { transfers } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, http as api } from '../helpers/deals.js';
import { deliverWebhook, transferEvent, verifyBody } from '../helpers/payments.js';
import { dealWithOrder, razorpayCaptured } from '../payments/fixture.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';
import { buildTestEnv } from '../testEnv.js';
import { adminUser } from './helpers.js';

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

const FAILED = {
  status: 'failed',
  fees: 0,
  tax: 0,
  processed_at: null,
  error: {
    code: 'BAD_REQUEST_TRANSFER_INSUFFICIENT_BALANCE',
    description: 'Insufficient balance to process the transfer',
  },
};

/** An advance paid by the brand whose Route transfer failed at Razorpay. */
async function failedTransfer(transfer: object = FAILED) {
  const f = await dealWithOrder(call, 'advance');
  const paymentId = razorpayCaptured(razorpay, f, 'advance', { transfer });
  const res = await call.send(
    'post',
    '/api/payments/verify',
    f.brand.cookie,
    verifyBody(f.orderId, paymentId),
  );
  expect(res.status).toBe(200);
  const [row] = await db.select().from(transfers).where(eq(transfers.dealId, f.deal.id));
  return { ...f, paymentId, transfer: row! };
}

const rowOf = async (id: string) =>
  (await db.select().from(transfers).where(eq(transfers.id, id)))[0]!;
const retry = (cookie: string, id: string) =>
  call.send('post', `/api/admin/transfers/${id}/retry`, cookie, {});
const markManual = (cookie: string, id: string, body: object = { reference: 'UTR123456' }) =>
  call.send('post', `/api/admin/transfers/${id}/mark-manual`, cookie, body);

describe('POST /api/admin/transfers/:id/retry', () => {
  // A retry creates a Route transfer, and Route is not available (REPLACEMENT_PLAN 0): the
  // route stays until Prompt 13 removes it, but it never calls Razorpay.
  it.each(['FAILED', 'PENDING', 'PROCESSED', 'REVERSED'] as const)(
    'answers 409 PAYMENT_RAIL_CHANGED for a %s transfer and calls Razorpay not at all',
    async (status) => {
      const admin = await adminUser();
      const f = await failedTransfer();
      await db.update(transfers).set({ status }).where(eq(transfers.id, f.transfer.id));
      const listedBefore = razorpay.fetchTransfersCalls.length;

      const res = await retry(admin.cookie, f.transfer.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_RAIL_CHANGED');
      expect(razorpay.createTransferCalls).toHaveLength(0);
      expect(razorpay.fetchTransfersCalls).toHaveLength(listedBefore);
      expect((await rowOf(f.transfer.id)).status).toBe(status);
    },
  );

  it('is 404 for an id that does not exist, so the admin routes still look alike', async () => {
    const admin = await adminUser();
    expect((await retry(admin.cookie, '0197c0a0-0000-7000-8000-000000000000')).status).toBe(404);
    expect((await retry(admin.cookie, 'nope')).status).toBe(404);
  });
});

describe('POST /api/admin/transfers/:id/mark-manual', () => {
  it('needs a reference', async () => {
    const admin = await adminUser();
    const f = await failedTransfer();
    for (const body of [
      {},
      { reference: '' },
      { reference: '   ' },
      { reference: 'x'.repeat(256) },
    ]) {
      const res = await markManual(admin.cookie, f.transfer.id, body);
      expect(res.status).toBe(400);
    }
    expect((await rowOf(f.transfer.id)).status).toBe('FAILED');
  });

  it.each(['FAILED', 'PENDING'] as const)(
    'marks a %s transfer paid with the manual fields set',
    async (status) => {
      const admin = await adminUser();
      const f = await failedTransfer();
      await db
        .update(transfers)
        .set({ status, failureReason: status === 'FAILED' ? 'x' : null })
        .where(eq(transfers.id, f.transfer.id));

      const res = await markManual(admin.cookie, f.transfer.id, { reference: ' UTR123456 ' });
      expect(res.status).toBe(200);
      expect(res.body.transfer).toMatchObject({
        status: 'PROCESSED',
        manualReference: 'UTR123456',
        failureReason: null,
      });
      const row = await rowOf(f.transfer.id);
      expect(row).toMatchObject({
        status: 'PROCESSED',
        manualReference: 'UTR123456',
        manualById: admin.user.id,
        failureReason: null,
      });
      expect(row.manualAt?.toISOString()).toBe(NOW.toISOString());
      expect(row.processedAt?.toISOString()).toBe(NOW.toISOString());
    },
  );

  it('is idempotent for the same reference and a conflict for another one', async () => {
    const admin = await adminUser();
    const f = await failedTransfer();
    expect((await markManual(admin.cookie, f.transfer.id)).status).toBe(200);
    expect((await markManual(admin.cookie, f.transfer.id)).status).toBe(200);
    const other = await markManual(admin.cookie, f.transfer.id, { reference: 'UTR999' });
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('TRANSFER_STATE_CONFLICT');
    expect((await rowOf(f.transfer.id)).manualReference).toBe('UTR123456');
  });

  it('refuses a transfer Razorpay processed or reversed', async () => {
    const admin = await adminUser();
    const f = await failedTransfer({ status: 'processed', processed_at: 1_790_000_000 });
    expect((await markManual(admin.cookie, f.transfer.id)).status).toBe(409);
    await db.update(transfers).set({ status: 'REVERSED' }).where(eq(transfers.id, f.transfer.id));
    expect((await markManual(admin.cookie, f.transfer.id)).status).toBe(409);
  });

  it('cannot be undone by a late transfer.failed webhook, and retry refuses it', async () => {
    const admin = await adminUser();
    const f = await failedTransfer({ status: 'created', processed_at: null });
    await markManual(admin.cookie, f.transfer.id);

    await deliverWebhook(
      app,
      transferEvent('transfer.failed', {
        id: f.transfer.razorpayTransferId,
        source: f.paymentId,
        recipient: f.accountId,
        amount: f.amount,
        currency: 'INR',
        ...FAILED,
      }),
    );
    expect(await rowOf(f.transfer.id)).toMatchObject({
      status: 'PROCESSED',
      manualReference: 'UTR123456',
    });

    const res = await retry(admin.cookie, f.transfer.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYMENT_RAIL_CHANGED');
    expect(razorpay.createTransferCalls).toHaveLength(0);
  });

  it('is 404 for an id that does not exist', async () => {
    const admin = await adminUser();
    expect((await markManual(admin.cookie, '0197c0a0-0000-7000-8000-000000000000')).status).toBe(
      404,
    );
  });
});
