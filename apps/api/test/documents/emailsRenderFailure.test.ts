import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { emailLog } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, http as api } from '../helpers/deals.js';
import { verifyBody } from '../helpers/payments.js';
import { dealWithOrder, razorpayCaptured } from '../payments/fixture.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';
import { buildTestEnv } from '../testEnv.js';

vi.mock('../../src/documents/documents.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/documents/documents.service.js')>()),
  renderInvoiceForPayment: vi.fn().mockRejectedValue(new Error('render failed')),
}));

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

describe('an attachment that cannot be rendered', () => {
  it('does not stop the payment or its email: the email goes without the PDF', async () => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    const res = await call.send(
      'post',
      '/api/payments/verify',
      f.brand.cookie,
      verifyBody(f.orderId, paymentId),
    );
    expect(res.status).toBe(200);
    expect(res.body.deal.status).toBe('COMMISSION_PAID');

    const rows = await db
      .select()
      .from(emailLog)
      .where(eq(emailLog.template, 'COMMISSION_PAID_BRAND'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'SENT', attachmentNames: [] });
  });
});
