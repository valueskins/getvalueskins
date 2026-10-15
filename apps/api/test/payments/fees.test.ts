import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { payments } from '../../src/db/schema/index.js';
import { adpBlocks } from '../../src/documents/adpBlocks.js';
import { loadAdpData } from '../../src/documents/adpData.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, http as api } from '../helpers/deals.js';
import { verifyBody } from '../helpers/payments.js';
import { buildTestEnv } from '../testEnv.js';
import { dealWithOrder, razorpayCaptured } from './fixture.js';
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

describe("Razorpay's fees are recorded for the deal report (SPEC 4.3, 17)", () => {
  it('stores the payment fee and tax at capture and lists them in the deal report', async () => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    razorpay.payments.get(paymentId)!.fee = 6_549;
    razorpay.payments.get(paymentId)!.tax = 1_179;
    await call.send(
      'post',
      '/api/payments/verify',
      f.brand.cookie,
      verifyBody(f.orderId, paymentId),
    );

    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.razorpayOrderId, f.orderId));
    expect(payment).toMatchObject({ razorpayFeePaise: 6_549, razorpayTaxPaise: 1_179 });

    const blocks = adpBlocks(await loadAdpData(f.deal.id), NOW);
    const table = blocks.find((b) => b.kind === 'table' && b.head[1] === 'Fee');
    // Only the commission goes through Razorpay, so it is the only line (SPEC 4.3).
    expect(table).toMatchObject({ rows: [['Payment: ValueSkins fee', '₹65.49', '₹11.79']] });
    const total = blocks.find((b) => b.kind === 'row' && b.label === 'Total absorbed');
    expect(total).toMatchObject({ value: '₹77.28' });
  });

  it('says "Not recorded" when Razorpay sent no fee', async () => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    await call.send(
      'post',
      '/api/payments/verify',
      f.brand.cookie,
      verifyBody(f.orderId, paymentId),
    );
    const blocks = adpBlocks(await loadAdpData(f.deal.id), NOW);
    expect(blocks.find((b) => b.kind === 'row' && b.label === 'Total absorbed')).toMatchObject({
      value: 'Not recorded',
    });
  });
});
