import { dealDetailResponseSchema, DISPUTE_ALREADY_OPEN } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { deals, invoices } from '../../src/db/schema/index.js';
import { adminUser } from '../admin/helpers.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http as api,
  insertApplication,
  insertDeal,
} from '../helpers/deals.js';
import { runDeal } from '../helpers/lifecycle.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();
const call = api(
  createApp(env, {
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

const detail = async (cookie: string | undefined, dealId: string) => {
  const res = await call.get(`/api/deals/${dealId}`, cookie);
  return {
    status: res.status,
    deal: res.status === 200 ? dealDetailResponseSchema.parse(res.body).deal : null,
  };
};

describe('GET /api/deals/:id: documents', () => {
  it('lists each document as it is issued: fee invoice, payment records, then the deal record', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'COMMISSION_PAID');
    const kinds = async () =>
      (await detail(brand.cookie, deal.id)).deal?.documents.map((d) => d.kind);
    expect(await kinds()).toEqual(['commission-invoice']);

    const done = await runDeal(call, razorpay, 'COMPLETED');
    const fresh = (await detail(done.creator.cookie, done.deal.id)).deal!;
    expect(fresh.documents.map((d) => d.kind)).toEqual([
      'commission-invoice',
      'advance-payment-record',
      'final-payment-record',
      'adp',
    ]);

    // The numbers and dates are the ones on the stored invoices; the deal record has no number.
    const rows = await db.select().from(invoices).where(eq(invoices.dealId, done.deal.id));
    const numberOf = Object.fromEntries(rows.map((r) => [r.kind, r.number]));
    expect(fresh.documents[0]).toMatchObject({ number: numberOf.COMMISSION_TAX_INVOICE });
    expect(fresh.documents[1]?.number).toMatch(/^VS-PR\//);
    expect(fresh.documents[1]?.number).toBe(numberOf.ADVANCE_PAYMENT_RECORD);
    expect(fresh.documents[2]?.number).toBe(numberOf.FINAL_PAYMENT_RECORD);
    expect(fresh.documents[3]).toEqual({
      kind: 'adp',
      number: null,
      issuedAt: fresh.completedAt,
    });
    for (const doc of fresh.documents) expect(Number.isNaN(Date.parse(doc.issuedAt))).toBe(false);
    void creator;
  });

  it('the brand, the confirmed creator and an admin see the same list, and every kind downloads', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'COMPLETED');
    const admin = await adminUser();
    const lists = [];
    for (const who of [brand, creator, admin]) {
      const { deal: d } = await detail(who.cookie, deal.id);
      lists.push(d!.documents);
    }
    expect(lists[1]).toEqual(lists[0]);
    expect(lists[2]).toEqual(lists[0]);
    for (const doc of lists[0]!) {
      const res = await call.get(`/api/deals/${deal.id}/documents/${doc.kind}`, creator.cookie);
      expect(res.status).toBe(200);
    }
  });

  it('is empty for anyone else, and the deal itself is a 404 once it has documents', async () => {
    const brand = await brandWithBilling();
    const open = await insertDeal(brand.user.id, 'OPEN');
    const stranger = await creatorWithPayout();
    const otherBrand = await brandWithBilling();
    const applicant = await creatorWithPayout();
    await insertApplication(open.id, applicant.user.id);

    for (const who of [stranger, otherBrand, applicant]) {
      const { deal } = await detail(who.cookie, open.id);
      expect(deal?.documents).toEqual([]);
      expect(deal?.disputes).toEqual([]);
    }

    const { deal: paid } = await runDeal(call, razorpay, 'COMMISSION_PAID');
    for (const who of [stranger, otherBrand, applicant]) {
      expect((await detail(who.cookie, paid.id)).status).toBe(404);
    }
  });
});

describe('GET /api/deals/:id: disputes', () => {
  const raise = (cookie: string, dealId: string) =>
    call.send('post', `/api/deals/${dealId}/disputes`, cookie, {
      subject: 'Late delivery',
      description: 'The content is two weeks late and the reply was rude.',
    });

  it('both parties see a dispute once it is raised, without the text, and RAISE_DISPUTE is disabled', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'ADVANCE_PAID');
    const before = (await detail(creator.cookie, deal.id)).deal!;
    expect(before.disputes).toEqual([]);
    expect(before.allowedActions.find((a) => a.action === 'RAISE_DISPUTE')).toEqual({
      action: 'RAISE_DISPUTE',
      enabled: true,
      reason: null,
    });

    const raised = await raise(creator.cookie, deal.id);
    expect(raised.status).toBe(201);

    for (const who of [brand, creator]) {
      const { deal: d } = await detail(who.cookie, deal.id);
      expect(d!.disputes).toEqual([
        {
          id: raised.body.dispute.id,
          subject: 'Late delivery',
          status: 'OPEN',
          raisedByRole: 'CREATOR',
          createdAt: expect.any(String),
          resolvedAt: null,
        },
      ]);
      expect(d!.allowedActions.find((a) => a.action === 'RAISE_DISPUTE')).toEqual({
        action: 'RAISE_DISPUTE',
        enabled: false,
        reason: DISPUTE_ALREADY_OPEN,
      });
      expect(JSON.stringify(d!.disputes)).not.toContain('two weeks late');
    }
  });

  it('shows the dispute as resolved, and lets either party raise again, after an admin resolves it', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'ADVANCE_PAID');
    const admin = await adminUser();
    const raised = await raise(brand.cookie, deal.id);
    const resolved = await call.send(
      'post',
      `/api/admin/disputes/${raised.body.dispute.id}/resolve`,
      admin.cookie,
      { resolution: 'Settled between the parties', refundReference: 'rfnd_1' },
    );
    expect(resolved.status).toBe(200);

    for (const who of [brand, creator]) {
      const { deal: d } = await detail(who.cookie, deal.id);
      expect(d!.disputes).toEqual([
        expect.objectContaining({
          status: 'RESOLVED',
          raisedByRole: 'BRAND',
          resolvedAt: NOW.toISOString(),
        }),
      ]);
      expect(d!.allowedActions.find((a) => a.action === 'RAISE_DISPUTE')?.enabled).toBe(true);
      // The resolution note and the refund reference stay with the admin and the emails.
      expect(JSON.stringify(d!.disputes)).not.toContain('Settled between');
      expect(JSON.stringify(d!.disputes)).not.toContain('rfnd_1');
    }
    expect((await raise(creator.cookie, deal.id)).status).toBe(201);
    const { deal: after } = await detail(brand.cookie, deal.id);
    expect(after!.disputes.map((x) => x.raisedByRole)).toEqual(['BRAND', 'CREATOR']);
  });

  it('lists a dispute for an admin too, and never for anyone who is not a party', async () => {
    const { creator, deal } = await runDeal(call, razorpay, 'APPROVED');
    await raise(creator.cookie, deal.id);
    const admin = await adminUser();
    expect((await detail(admin.cookie, deal.id)).deal!.disputes).toHaveLength(1);

    const otherBrand = await brandWithBilling();
    const otherCreator = await creatorWithPayout();
    for (const who of [otherBrand, otherCreator]) {
      expect((await detail(who.cookie, deal.id)).status).toBe(404);
    }
    // A cancelled deal that had a creator keeps the dispute visible to its two parties.
    await db.update(deals).set({ status: 'CANCELLED' }).where(eq(deals.id, deal.id));
    expect((await detail(creator.cookie, deal.id)).deal!.disputes).toHaveLength(1);
  });
});

describe('GET /api/deals/:id: feedback history', () => {
  const feedback = (cookie: string, dealId: string, text: string) =>
    call.send('post', `/api/deals/${dealId}/feedback`, cookie, { feedback: text });
  const upload = (cookie: string, dealId: string) =>
    call.send('post', `/api/deals/${dealId}/content`, cookie, {
      link: 'https://drive.google.com/file/d/again/view',
    });

  it('lists every round, oldest first, to the two parties and admins only', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'CONTENT_UPLOADED');
    expect((await feedback(brand.cookie, deal.id, 'Reshoot the intro')).status).toBe(200);
    expect((await upload(creator.cookie, deal.id)).status).toBe(200);
    expect((await feedback(brand.cookie, deal.id, 'Brighter light, please')).status).toBe(200);

    const admin = await adminUser();
    for (const who of [brand, creator, admin]) {
      const d = (await detail(who.cookie, deal.id)).deal!;
      expect(d.feedbackHistory.map((f) => f.feedback)).toEqual([
        'Reshoot the intro',
        'Brighter light, please',
      ]);
      expect(d.feedbackHistory.every((f) => typeof f.at === 'string')).toBe(true);
    }
  });

  it('is empty for a deal with no feedback yet', async () => {
    const { brand, deal } = await runDeal(call, razorpay, 'CONTENT_UPLOADED');
    expect((await detail(brand.cookie, deal.id)).deal!.feedbackHistory).toEqual([]);
  });
});

describe('GET /api/deals/:id: applied', () => {
  it('tells a creator whether they applied, and is null for brands and admins', async () => {
    const brand = await brandWithBilling();
    const applicant = await creatorWithPayout();
    const other = await creatorWithPayout();
    const stranger = await brandWithBilling();
    const admin = await adminUser();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    await insertApplication(deal.id, applicant.user.id);

    expect((await detail(applicant.cookie, deal.id)).deal!.applied).toBe(true);
    expect((await detail(other.cookie, deal.id)).deal!.applied).toBe(false);
    expect((await detail(brand.cookie, deal.id)).deal!.applied).toBeNull();
    expect((await detail(stranger.cookie, deal.id)).deal!.applied).toBeNull();
    expect((await detail(admin.cookie, deal.id)).deal!.applied).toBeNull();
    // A creator who has not applied sees no delivery history of anyone else's deal.
    expect((await detail(other.cookie, deal.id)).deal!.feedbackHistory).toEqual([]);
  });

  it('stays true for the creator once they are confirmed', async () => {
    const { creator, deal } = await runDeal(call, razorpay, 'COMMISSION_PAID');
    expect((await detail(creator.cookie, deal.id)).deal!.applied).toBe(true);
  });
});
