import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { brandBilling, invoices } from '../../src/db/schema/index.js';
import { loadAdpData } from '../../src/documents/adpData.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, brandWithBilling, http } from '../helpers/deals.js';
import { runDeal } from '../helpers/lifecycle.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';
import { buildTestEnv } from '../testEnv.js';

const call = http(
  createApp(buildTestEnv(), {
    now: () => NOW,
    razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} },
  }),
);
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

describe('DELETE /api/me removes brand billing', () => {
  it('deletes the billing row, and the documents keep the billing they were issued with', async () => {
    const { brand, deal } = await runDeal(call, razorpay, 'COMPLETED');
    const other = await brandWithBilling();
    const before = await loadAdpData(deal.id);
    const invoicesBefore = await db.select().from(invoices).where(eq(invoices.dealId, deal.id));
    expect(before.brandBilling?.billingName).toBe('Brand Pvt Ltd');

    const res = await call.send('delete', '/api/me', brand.cookie);
    expect(res.status).toBe(200);

    expect(
      await db.select().from(brandBilling).where(eq(brandBilling.userId, brand.user.id)),
    ).toEqual([]);
    // Another brand's billing is untouched.
    expect(
      await db.select().from(brandBilling).where(eq(brandBilling.userId, other.user.id)),
    ).toHaveLength(1);

    const after = await loadAdpData(deal.id);
    expect(after.brandBilling).toEqual(before.brandBilling);
    const invoicesAfter = await db.select().from(invoices).where(eq(invoices.dealId, deal.id));
    expect(invoicesAfter.map((i) => i.snapshot)).toEqual(invoicesBefore.map((i) => i.snapshot));
  });
});
