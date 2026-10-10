import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { applications } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http,
  insertApplication,
  insertDeal,
  sentEmails,
} from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();
let clock = NOW;
const api = http(createApp(env, { now: () => clock }));

beforeAll(resetDb);
beforeEach(async () => {
  clock = NOW;
  await truncateAll();
});
afterAll(closeDb);

const apply = (cookie: string, dealId: string) =>
  api.send('post', `/api/deals/${dealId}/applications`, cookie, {});
const rows = (dealId: string) =>
  db.select().from(applications).where(eq(applications.dealId, dealId));

describe('POST /api/deals/:id/applications', () => {
  it('creates an APPLIED application and emails the brand (email 2)', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout('ACTIVE');
    const deal = await insertDeal(brand.user.id, 'OPEN');

    const res = await apply(creator.cookie, deal.id);
    expect(res.status).toBe(201);
    expect(res.body.application).toMatchObject({ dealId: deal.id, status: 'APPLIED' });

    expect(await rows(deal.id)).toMatchObject([{ creatorId: creator.user.id, status: 'APPLIED' }]);
    const emails = await sentEmails('NEW_APPLICATION');
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ toEmail: brand.user.email, dealId: deal.id });
    expect(emails[0]?.bodyText).toContain(creator.user.username);
  });

  describe('payout gating (REPLACEMENT_PLAN 2.1)', () => {
    const missing: Array<[string, Parameters<typeof creatorWithPayout>[1]]> = [
      ['no UPI details at all', {}],
      ['a UPI ID and name but no consent', { payoutVpa: 'a.b@okaxis', payoutName: 'A B' }],
      [
        'consent and a UPI ID but no name',
        { payoutVpa: 'a.b@okaxis', payoutVpaConsentAt: new Date() },
      ],
      ['consent and a name but no UPI ID', { payoutName: 'A B', payoutVpaConsentAt: new Date() }],
    ];

    it.each(missing)('refuses a creator with %s', async (_label, overrides) => {
      const brand = await brandWithBilling();
      const creator = await creatorWithPayout(null, overrides);
      const deal = await insertDeal(brand.user.id, 'OPEN');

      const res = await apply(creator.cookie, deal.id);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({
        code: 'PAYOUT_NOT_SET',
        message: 'Add your UPI ID to apply',
      });
      expect(await rows(deal.id)).toHaveLength(0);
      expect(await sentEmails('NEW_APPLICATION')).toHaveLength(0);
    });

    it('lets the same creator apply once the details are saved through the API', async () => {
      const brand = await brandWithBilling();
      const creator = await creatorWithPayout(null);
      const deal = await insertDeal(brand.user.id, 'OPEN');
      expect((await apply(creator.cookie, deal.id)).status).toBe(403);

      const saved = await api.send('put', '/api/me/payout-upi', creator.cookie, {
        vpa: 'new.creator@okaxis',
        name: 'New Creator',
        consent: true,
      });
      expect(saved.status).toBe(200);
      expect((await apply(creator.cookie, deal.id)).status).toBe(201);
    });
  });

  describe('application deadline (end of day IST)', () => {
    it('accepts an application until 23:59:59 IST on the deadline date', async () => {
      const brand = await brandWithBilling();
      const creator = await creatorWithPayout();
      const deal = await insertDeal(brand.user.id, 'OPEN', { applicationDeadline: '2026-10-12' });

      clock = new Date('2026-10-12T18:29:58Z');
      expect((await apply(creator.cookie, deal.id)).status).toBe(201);
    });

    it('answers APPLICATIONS_CLOSED from the first second after it', async () => {
      const brand = await brandWithBilling();
      const creator = await creatorWithPayout();
      const deal = await insertDeal(brand.user.id, 'OPEN', { applicationDeadline: '2026-10-12' });

      clock = new Date('2026-10-12T18:30:00Z');
      const res = await apply(creator.cookie, deal.id);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: 'APPLICATIONS_CLOSED',
        message: 'Applications closed',
      });
      expect(await rows(deal.id)).toHaveLength(0);
    });

    it('does not count a closed deal against the daily limit', async () => {
      const brand = await brandWithBilling();
      const creator = await creatorWithPayout();
      const closed = await insertDeal(brand.user.id, 'OPEN', { applicationDeadline: '2026-10-08' });
      const open = await insertDeal(brand.user.id, 'OPEN');
      for (let i = 0; i < 25; i++)
        expect((await apply(creator.cookie, closed.id)).status).toBe(409);
      expect((await apply(creator.cookie, open.id)).status).toBe(201);
    });
  });

  it('refuses a second application to the same deal', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    expect((await apply(creator.cookie, deal.id)).status).toBe(201);

    const again = await apply(creator.cookie, deal.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_APPLIED');
    expect(await rows(deal.id)).toHaveLength(1);
    expect(await sentEmails('NEW_APPLICATION')).toHaveLength(1);
  });

  it('lets only one of two parallel applications from the same creator in', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    const [a, b] = await Promise.all([
      apply(creator.cookie, deal.id),
      apply(creator.cookie, deal.id),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await rows(deal.id)).toHaveLength(1);
  });

  it.each(['DRAFT', 'CONFIRMED', 'COMMISSION_PAID', 'CANCELLED', 'COMPLETED'] as const)(
    'is a 404 for a %s deal',
    async (status) => {
      const brand = await brandWithBilling();
      const creator = await creatorWithPayout();
      const deal = await insertDeal(brand.user.id, status);
      expect((await apply(creator.cookie, deal.id)).status).toBe(404);
      expect(await rows(deal.id)).toHaveLength(0);
    },
  );

  it('is a 404 for an unknown deal', async () => {
    const creator = await creatorWithPayout();
    expect((await apply(creator.cookie, '01a11f37-1217-712d-962d-13a5004bd584')).status).toBe(404);
    expect((await apply(creator.cookie, 'nope')).status).toBe(404);
  });

  it('is for creators only, and takes no body', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    expect((await apply(brand.cookie, deal.id)).status).toBe(403);
    const res = await api.send('post', `/api/deals/${deal.id}/applications`, creator.cookie, {
      message: 'hire me',
    });
    expect(res.status).toBe(400);
  });

  it('allows 20 applications per 24 hours and answers 429 on the 21st', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const open = [];
    for (let i = 0; i < 21; i++) open.push(await insertDeal(brand.user.id, 'OPEN'));

    for (const deal of open.slice(0, 20)) {
      expect((await apply(creator.cookie, deal.id)).status).toBe(201);
    }
    const res = await apply(creator.cookie, open[20]!.id);
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(await rows(open[20]!.id)).toHaveLength(0);
  });

  it('never leaves an APPLIED application on a deal that got confirmed while it was applying', async () => {
    const brand = await brandWithBilling();
    const first = await creatorWithPayout();
    for (let round = 0; round < 6; round++) {
      const late = await creatorWithPayout();
      const deal = await insertDeal(brand.user.id, 'OPEN');
      const firstApplication = await insertApplication(deal.id, first.user.id);

      const [confirmRes, applyRes] = await Promise.all([
        api.send('post', `/api/applications/${firstApplication.id}/confirm`, brand.cookie, {}),
        apply(late.cookie, deal.id),
      ]);

      expect(confirmRes.status).toBe(200);
      expect([201, 404, 409]).toContain(applyRes.status);
      const all = await rows(deal.id);
      expect(all.filter((a) => a.status === 'CONFIRMED')).toHaveLength(1);
      expect(all.filter((a) => a.status === 'APPLIED')).toHaveLength(0);
      if (applyRes.status === 201) {
        // The late application got in first and was rejected by the confirm.
        const mine = await db
          .select()
          .from(applications)
          .where(and(eq(applications.dealId, deal.id), eq(applications.creatorId, late.user.id)));
        expect(mine[0]?.status).toBe('REJECTED');
      }
    }
  });
});
