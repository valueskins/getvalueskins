import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { brandBilling, invoices } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
import { NOW, brandWithBilling, creatorWithPayout, http as api } from '../helpers/deals.js';
import { runDeal } from '../helpers/lifecycle.js';
import { verifyBody } from '../helpers/payments.js';
import { dealWithOrder, razorpayCaptured } from '../payments/fixture.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();
const options = {
  now: () => NOW,
  razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} },
};
const app = createApp(env, options);
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

const doc = (cookie: string | undefined, dealId: string, kind: string) =>
  call.get(`/api/deals/${dealId}/documents/${kind}`, cookie);

const isPdf = (body: unknown) =>
  Buffer.isBuffer(body) && body.subarray(0, 5).toString() === '%PDF-';

describe('GET /api/deals/:id/documents/:kind', () => {
  it('a completed deal produces all four PDFs for the brand, the creator and an admin', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'COMPLETED');
    const admin = await createUserWithSession({ isAdmin: true });
    const expected = {
      'commission-invoice': 'VS-2026-27-000001.pdf',
      'advance-payment-record': 'VS-PR-2026-27-000001.pdf',
      'final-payment-record': 'VS-PR-2026-27-000002.pdf',
      adp: `ValueSkins-Deal-Report-${deal.shortId}.pdf`,
    };

    for (const who of [brand, creator, admin]) {
      for (const [kind, filename] of Object.entries(expected)) {
        const res = await doc(who.cookie, deal.id, kind);
        expect(res.status, `${kind} as ${who.user.username}`).toBe(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.headers['content-disposition']).toBe(`attachment; filename="${filename}"`);
        expect(res.headers['cache-control']).toBe('private, no-store');
        expect(isPdf(res.body)).toBe(true);
      }
    }
  });

  it('each document exists only once its payment is captured, and the report only when COMPLETED', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'COMMISSION_PAID');
    expect((await doc(brand.cookie, deal.id, 'commission-invoice')).status).toBe(200);
    for (const kind of ['advance-payment-record', 'final-payment-record', 'adp']) {
      const res = await doc(creator.cookie, deal.id, kind);
      expect(res.status, kind).toBe(409);
      expect(res.body.error.code).toBe('DOCUMENT_NOT_AVAILABLE');
    }

    const advanced = await runDeal(call, razorpay, 'APPROVED');
    expect(
      (await doc(advanced.brand.cookie, advanced.deal.id, 'advance-payment-record')).status,
    ).toBe(200);
    expect(
      (await doc(advanced.brand.cookie, advanced.deal.id, 'final-payment-record')).status,
    ).toBe(409);
    // Approved is not completed: the deal report waits for the final payment.
    expect((await doc(advanced.brand.cookie, advanced.deal.id, 'adp')).status).toBe(409);
  });

  it('is only for the deal brand, its confirmed creator and admins', async () => {
    const { deal } = await runDeal(call, razorpay, 'COMPLETED');
    const otherBrand = await brandWithBilling();
    const otherCreator = await creatorWithPayout();
    for (const kind of [
      'commission-invoice',
      'advance-payment-record',
      'final-payment-record',
      'adp',
    ]) {
      expect((await doc(otherBrand.cookie, deal.id, kind)).status, kind).toBe(404);
      expect((await doc(otherCreator.cookie, deal.id, kind)).status, kind).toBe(404);
      expect((await doc(undefined, deal.id, kind)).status, kind).toBe(401);
    }
    expect((await doc(otherBrand.cookie, 'not-a-uuid', 'adp')).status).toBe(404);
  });

  it('rejects an unknown document kind for a participant', async () => {
    const { brand, deal } = await runDeal(call, razorpay, 'COMMISSION_PAID');
    expect((await doc(brand.cookie, deal.id, 'refund-note')).status).toBe(400);
  });

  it('re-rendering from the stored snapshot gives the same bytes, even after the billing details and company env change', async () => {
    const { brand, deal } = await runDeal(call, razorpay, 'COMPLETED');
    const before = await doc(brand.cookie, deal.id, 'commission-invoice');
    const beforeReceipt = await doc(brand.cookie, deal.id, 'advance-payment-record');

    await db
      .update(brandBilling)
      .set({ billingName: 'Renamed Brand', billingState: 'Kerala' })
      .where(eq(brandBilling.userId, brand.user.id));
    const otherEnvApp = api(
      createApp(buildTestEnv({ COMPANY_LEGAL_NAME: 'Another Company Ltd', COMPANY_STATE: 'Goa' }), {
        ...options,
        now: () => new Date('2027-01-01T00:00:00Z'),
      }),
    );

    const after = await otherEnvApp.get(
      `/api/deals/${deal.id}/documents/commission-invoice`,
      brand.cookie,
    );
    const afterRecord = await otherEnvApp.get(
      `/api/deals/${deal.id}/documents/advance-payment-record`,
      brand.cookie,
    );
    expect(after.status).toBe(200);
    expect((after.body as Buffer).equals(before.body as Buffer)).toBe(true);
    expect((afterRecord.body as Buffer).equals(beforeReceipt.body as Buffer)).toBe(true);
  });

  it('a payment captured on a deal that cannot take it gets no invoice and no document', async () => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    await call.send('post', `/api/deals/${f.deal.id}/cancel`, f.brand.cookie, {
      reason: 'changed',
    });
    const res = await call.send(
      'post',
      '/api/payments/verify',
      f.brand.cookie,
      verifyBody(f.orderId, paymentId),
    );
    expect(res.body.payment.status).toBe('CAPTURED');

    expect(await db.select().from(invoices)).toHaveLength(0);
    expect((await doc(f.brand.cookie, f.deal.id, 'commission-invoice')).status).toBe(409);
  });
});
