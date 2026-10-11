import { PAYMENT_RECORD_DISCLAIMER, computeBreakdown } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { dealEvents, directPayments, emailLog, invoices } from '../../src/db/schema/index.js';
import { adpBlocks } from '../../src/documents/adpBlocks.js';
import { loadAdpData } from '../../src/documents/adpData.js';
import type { Block } from '../../src/documents/blocks.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  READY_DRAFT,
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http as api,
} from '../helpers/deals.js';
import { DRIVE_LINK } from '../helpers/lifecycle.js';
import { verifyBody } from '../helpers/payments.js';
import {
  confirmPayment,
  notReceived,
  razorpayCaptured,
  recordPayment,
} from '../payments/fixture.js';
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

const textOf = (blocks: Block[]) =>
  blocks.flatMap((b) =>
    b.kind === 'table'
      ? [...b.head, ...b.rows.flat()]
      : b.kind === 'row'
        ? [b.label, b.value]
        : 'text' in b
          ? [b.text]
          : [],
  );

describe('the whole deal, with the real endpoints', () => {
  it('draft, publish, apply, confirm, fee, advance, content, approve, final, COMPLETED, report', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout(null);
    const expected = computeBreakdown(10_000_00, 0);

    // The creator saves a UPI ID, which applying needs.
    expect(
      (
        await call.send('put', '/api/me/payout-upi', creator.cookie, {
          vpa: 'full.flow@okaxis',
          name: 'Full Flow',
          consent: true,
        })
      ).status,
    ).toBe(200);

    // Draft and publish.
    const draft = await call.send('post', '/api/deals', brand.cookie, READY_DRAFT);
    const dealId = draft.body.deal.id as string;
    expect((await call.send('post', `/api/deals/${dealId}/publish`, brand.cookie, {})).status).toBe(
      200,
    );

    // Apply and confirm.
    const applied = await call.send(
      'post',
      `/api/deals/${dealId}/applications`,
      creator.cookie,
      {},
    );
    expect(applied.status).toBe(201);
    const confirmed = await call.send(
      'post',
      `/api/applications/${applied.body.application.id}/confirm`,
      brand.cookie,
      {},
    );
    expect(confirmed.body.deal.status).toBe('CONFIRMED');

    // The fee through Razorpay (mocked).
    const order = await call.send(
      'post',
      `/api/deals/${dealId}/payments/commission/order`,
      brand.cookie,
      {},
    );
    expect(order.status).toBe(200);
    const paymentId = razorpayCaptured(
      razorpay,
      { orderId: order.body.orderId, amount: order.body.amountPaise },
      'commission',
    );
    const verified = await call.send(
      'post',
      '/api/payments/verify',
      brand.cookie,
      verifyBody(order.body.orderId, paymentId),
    );
    expect(verified.body.deal.status).toBe('COMMISSION_PAID');

    // Advance: the brand reads what to pay, pays by UPI outside ValueSkins, records the reference.
    const due = await call.get(`/api/deals/${dealId}/direct-payment`, brand.cookie);
    expect(due.body).toMatchObject({
      stage: 'ADVANCE',
      amountPaise: expected.advancePaise,
      payee: { vpa: 'full.flow@okaxis', name: 'Full Flow' },
    });
    const advance = await recordPayment(
      call,
      { cookie: brand.cookie, user: brand.user },
      dealId,
      'ADVANCE',
      'ADVANCEUTR01',
    );
    expect(advance.status).toBe(201);
    expect((await call.get(`/api/deals/${dealId}`, brand.cookie)).body.deal.status).toBe(
      'COMMISSION_PAID',
    );
    // A first attempt the creator did not receive, then a second that arrived.
    const disputed = await notReceived(
      call,
      creator,
      advance.body.directPayment.id,
      'Not in my account',
    );
    expect(disputed.status).toBe(200);
    const again = await recordPayment(call, brand, dealId, 'ADVANCE', 'ADVANCEUTR02');
    const advanceDone = await confirmPayment(call, creator, again.body.directPayment.id);
    expect(advanceDone.body.deal.status).toBe('ADVANCE_PAID');

    // Content and approval.
    expect(
      (
        await call.send('post', `/api/deals/${dealId}/content`, creator.cookie, {
          link: DRIVE_LINK,
        })
      ).status,
    ).toBe(200);
    expect(
      (await call.send('post', `/api/deals/${dealId}/approve`, brand.cookie, {})).body.deal.status,
    ).toBe('APPROVED');

    // Final.
    const finalDue = await call.get(`/api/deals/${dealId}/direct-payment`, brand.cookie);
    expect(finalDue.body).toMatchObject({ stage: 'FINAL', amountPaise: expected.finalPaise });
    const final = await recordPayment(call, brand, dealId, 'FINAL', 'FINALUTR0001');
    const finalDone = await confirmPayment(call, creator, final.body.directPayment.id);
    expect(finalDone.body.deal).toMatchObject({
      status: 'COMPLETED',
      completedAt: NOW.toISOString(),
    });
    // Nothing is due any more.
    expect((await call.get(`/api/deals/${dealId}/direct-payment`, brand.cookie)).body.blocked).toBe(
      'not_due',
    );

    // The timeline: every move is by the right actor.
    const events = await db.select().from(dealEvents).where(eq(dealEvents.dealId, dealId));
    const moves = events.map((e) => `${e.fromStatus}>${e.toStatus}:${e.actorType}`);
    expect(moves).toEqual([
      'DRAFT>OPEN:USER',
      'OPEN>CONFIRMED:USER',
      'CONFIRMED>COMMISSION_PAID:SYSTEM',
      'COMMISSION_PAID>ADVANCE_PAID:USER',
      'ADVANCE_PAID>CONTENT_UPLOADED:USER',
      'CONTENT_UPLOADED>APPROVED:USER',
      'APPROVED>COMPLETED:USER',
    ]);

    // The documents: one tax invoice and one payment record for each stage.
    const documents = await db.select().from(invoices).where(eq(invoices.dealId, dealId));
    expect(documents.map((d) => d.number).sort()).toEqual([
      'VS-PR/2026-27/000001',
      'VS-PR/2026-27/000002',
      'VS/2026-27/000001',
    ]);

    // The report lists every record, the disputed one too, with the UPI ID masked.
    const text = textOf(adpBlocks(await loadAdpData(dealId), NOW));
    expect(text).toEqual(
      expect.arrayContaining([
        'ADVANCEUTR01',
        'ADVANCEUTR02',
        'FINALUTR0001',
        PAYMENT_RECORD_DISCLAIMER,
      ]),
    );
    expect(
      text.some((t) => t.startsWith('Not received 9 Oct 2026') && t.includes('Not in my account')),
    ).toBe(true);
    expect(text.join(' ')).not.toContain('full.flow');
    expect(
      await db.select().from(directPayments).where(eq(directPayments.dealId, dealId)),
    ).toHaveLength(3);

    // The emails: fee (4), advance recorded (17 twice), not received (18), confirmed (5, 9) and the report (10).
    const templates = (await db.select().from(emailLog).where(eq(emailLog.dealId, dealId))).map(
      (e) => e.template,
    );
    const count = (t: string) => templates.filter((x) => x === t).length;
    expect(count('COMMISSION_PAID_BRAND')).toBe(1);
    expect(count('DIRECT_PAYMENT_RECORDED')).toBe(3);
    expect(count('DIRECT_PAYMENT_NOT_RECEIVED')).toBe(2);
    expect(count('ADVANCE_PAID')).toBe(2);
    expect(count('FINAL_PAYMENT_DONE')).toBe(2);
    expect(count('DEAL_REPORT_READY')).toBe(2);
  });
});
