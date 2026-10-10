import { asc } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { emailLog } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, http as api } from '../helpers/deals.js';
import { runDeal } from '../helpers/lifecycle.js';
import { deliverWebhook, paymentCapturedEvent, verifyBody } from '../helpers/payments.js';
import { dealWithOrder, razorpayCaptured } from '../payments/fixture.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';
import { buildTestEnv } from '../testEnv.js';

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

const sentInOrder = () => db.select().from(emailLog).orderBy(asc(emailLog.id));

describe('payment emails carry their PDFs (SPEC 8)', () => {
  it('sends 4, 5, 9 and 10 with the right attachment to the right people, email 10 after email 9', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'COMPLETED');
    const rows = (await sentInOrder()).filter((r) => r.dealId === deal.id);
    const find = (template: string, userId: string) =>
      rows.find((r) => r.template === template && r.userId === userId);

    expect(find('COMMISSION_PAID_BRAND', brand.user.id)?.attachmentNames).toEqual([
      'VS-2026-27-000001.pdf',
    ]);
    // The creator's email 4 is a notice only.
    expect(find('COMMISSION_PAID_CREATOR', creator.user.id)?.attachmentNames).toBeNull();

    for (const who of [brand, creator]) {
      expect(find('ADVANCE_PAID', who.user.id)?.attachmentNames).toEqual([
        'VS-R-2026-27-000001.pdf',
      ]);
      expect(find('FINAL_PAYMENT_DONE', who.user.id)?.attachmentNames).toEqual([
        'VS-R-2026-27-000002.pdf',
      ]);
      expect(find('DEAL_REPORT_READY', who.user.id)?.attachmentNames).toEqual([
        `ValueSkins-Deal-Report-${deal.shortId}.pdf`,
      ]);
      expect(find('DEAL_REPORT_READY', who.user.id)?.status).toBe('SENT');
    }

    // Email 10 follows email 9 for the final payment.
    const order = rows.map((r) => r.template);
    expect(order.lastIndexOf('FINAL_PAYMENT_DONE')).toBeLessThan(
      order.indexOf('DEAL_REPORT_READY'),
    );
    expect(rows.filter((r) => r.template === 'DEAL_REPORT_READY')).toHaveLength(2);
  });

  it('says "invoice", not "tax invoice", on the brand email', async () => {
    const { brand, deal } = await runDeal(call, razorpay, 'COMMISSION_PAID');
    const rows = (await sentInOrder()).filter((r) => r.dealId === deal.id);
    const email = rows.find(
      (r) => r.template === 'COMMISSION_PAID_BRAND' && r.userId === brand.user.id,
    );
    expect(email?.bodyText).toContain('The invoice is attached.');
  });

  it('duplicate verifies and webhooks send each of the four emails exactly once', async () => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    const verify = () =>
      call.send('post', '/api/payments/verify', f.brand.cookie, verifyBody(f.orderId, paymentId));
    await Promise.all([
      verify(),
      verify(),
      deliverWebhook(app, paymentCapturedEvent(f.orderId, paymentId, f.amount)),
    ]);
    const rows = (await sentInOrder()).filter((r) => r.dealId === f.deal.id);
    expect(rows.map((r) => r.template).sort()).toEqual([
      'COMMISSION_PAID_BRAND',
      'COMMISSION_PAID_CREATOR',
    ]);
  });
});
