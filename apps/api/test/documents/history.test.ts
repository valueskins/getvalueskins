import { dealEmailListResponseSchema, dealEventListResponseSchema } from '@valueskins/shared';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { emailLog } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
import { NOW, brandWithBilling, creatorWithPayout, http as api } from '../helpers/deals.js';
import { runDeal } from '../helpers/lifecycle.js';
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

describe('GET /api/deals/:id/emails', () => {
  it("shows both parties the deal's emails, with who they went to and no addresses", async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'COMPLETED');
    for (const who of [brand, creator]) {
      const res = await call.get(`/api/deals/${deal.id}/emails?limit=50`, who.cookie);
      expect(res.status).toBe(200);
      const body = dealEmailListResponseSchema.parse(res.body);
      const templates = body.items.map((i) => i.template);
      expect(templates).toEqual(
        expect.arrayContaining([
          'COMMISSION_PAID_BRAND',
          'COMMISSION_PAID_CREATOR',
          'ADVANCE_PAID',
          'CONTENT_UPLOADED',
          'CONTENT_APPROVED',
          'FINAL_PAYMENT_DONE',
          'DEAL_REPORT_READY',
        ]),
      );
      const report = body.items.find(
        (i) => i.template === 'DEAL_REPORT_READY' && i.recipient?.role === 'CREATOR',
      );
      expect(report).toMatchObject({
        recipient: { role: 'CREATOR', username: creator.user.username },
        attachmentNames: [`ValueSkins-Deal-Record-${deal.shortId}.pdf`],
        status: 'SENT',
      });
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(brand.user.email!);
      expect(text).not.toContain(creator.user.email!);
      expect(text).not.toContain('toEmail');
    }
  });

  it("leaves out other people's emails for the parties but admins see them all", async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'COMMISSION_PAID');
    const applicant = await creatorWithPayout();
    await db.insert(emailLog).values({
      dealId: deal.id,
      userId: applicant.user.id,
      toEmail: applicant.user.email!,
      template: 'APPLICATION_NOT_SELECTED',
      subject: 'Not selected',
      bodyText: 'You were not chosen',
      status: 'SENT',
    });

    const asBrand = await call.get(`/api/deals/${deal.id}/emails?limit=50`, brand.cookie);
    expect(asBrand.body.items.map((i: { template: string }) => i.template)).not.toContain(
      'APPLICATION_NOT_SELECTED',
    );
    const asCreator = await call.get(`/api/deals/${deal.id}/emails?limit=50`, creator.cookie);
    expect(asCreator.body.items.map((i: { template: string }) => i.template)).not.toContain(
      'APPLICATION_NOT_SELECTED',
    );

    const admin = await createUserWithSession({ isAdmin: true });
    const asAdmin = await call.get(`/api/deals/${deal.id}/emails?limit=50`, admin.cookie);
    expect(asAdmin.body.items.map((i: { template: string }) => i.template)).toContain(
      'APPLICATION_NOT_SELECTED',
    );
  });

  it('pages newest first without gaps', async () => {
    const { brand, deal } = await runDeal(call, razorpay, 'ADVANCE_PAID');
    const all = (await call.get(`/api/deals/${deal.id}/emails?limit=50`, brand.cookie)).body;
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const res: { body: { items: Array<{ id: string }>; nextCursor: string | null } } =
        await call.get(
          `/api/deals/${deal.id}/emails?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
          brand.cookie,
        );
      seen.push(...res.body.items.map((x) => x.id));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(all.items.map((x: { id: string }) => x.id));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('is for the deal parties and admins only', async () => {
    const { deal } = await runDeal(call, razorpay, 'COMMISSION_PAID');
    const otherBrand = await brandWithBilling();
    const otherCreator = await creatorWithPayout();
    for (const who of [otherBrand, otherCreator]) {
      expect((await call.get(`/api/deals/${deal.id}/emails`, who.cookie)).status).toBe(404);
      expect((await call.get(`/api/deals/${deal.id}/events`, who.cookie)).status).toBe(404);
    }
    expect((await call.get(`/api/deals/${deal.id}/emails`)).status).toBe(401);
    expect((await call.get(`/api/deals/${deal.id}/events`)).status).toBe(401);
  });
});

describe('GET /api/deals/:id/events', () => {
  it('lists every status change oldest first, with the feedback as the note and no internal metadata', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'CONTENT_UPLOADED');
    await call.send('post', `/api/deals/${deal.id}/feedback`, brand.cookie, {
      feedback: 'Reshoot the intro',
    });

    const res = await call.get(`/api/deals/${deal.id}/events?limit=50`, creator.cookie);
    expect(res.status).toBe(200);
    const body = dealEventListResponseSchema.parse(res.body);
    // The advance was recorded by the brand (an entry that left the status as it was), then confirmed.
    expect(body.items.map((e) => `${e.kind}:${e.fromStatus}>${e.toStatus}`)).toEqual([
      'TRANSITION:CONFIRMED>COMMISSION_PAID',
      'PAYMENT_RECORDED:COMMISSION_PAID>COMMISSION_PAID',
      'TRANSITION:COMMISSION_PAID>ADVANCE_PAID',
      'TRANSITION:ADVANCE_PAID>CONTENT_UPLOADED',
      'TRANSITION:CONTENT_UPLOADED>REVISION_REQUESTED',
    ]);
    expect(body.items[0]).toMatchObject({
      actor: { type: 'SYSTEM', role: 'SYSTEM', username: null },
      refundReference: null,
    });
    expect(body.items[1]).toMatchObject({
      actor: { type: 'USER', role: 'BRAND', username: brand.user.username },
    });
    expect(body.items[3]).toMatchObject({
      actor: { type: 'USER', role: 'CREATOR', username: creator.user.username },
    });
    expect(body.items[4]).toMatchObject({
      note: 'Reshoot the intro',
      actor: { type: 'USER', role: 'BRAND', username: brand.user.username },
    });
    expect(JSON.stringify(res.body)).not.toContain('metadata');
    expect(JSON.stringify(res.body)).not.toContain('razorpayPaymentId');
  });

  it('pages oldest first', async () => {
    const { brand, deal } = await runDeal(call, razorpay, 'CONTENT_UPLOADED');
    const first = await call.get(`/api/deals/${deal.id}/events?limit=3`, brand.cookie);
    expect(first.body.items).toHaveLength(3);
    const second = await call.get(
      `/api/deals/${deal.id}/events?limit=3&cursor=${first.body.nextCursor}`,
      brand.cookie,
    );
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    expect(second.body.items[0].toStatus).toBe('CONTENT_UPLOADED');
  });
});
