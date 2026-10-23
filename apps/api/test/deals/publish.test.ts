import { computeBreakdown } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { brandBilling, dealEvents, deals } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  READY_DRAFT,
  brandWithBilling,
  http,
  insertDeal,
  sentEmails,
} from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();
const api = http(createApp(env, { now: () => NOW }));

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

async function draft(cookie: string, body: object = READY_DRAFT): Promise<string> {
  return (await api.send('post', '/api/deals', cookie, body)).body.deal.id;
}

describe('POST /api/deals/:id/publish: messages use the names on the form', () => {
  it('names the fields Apply by, Content due and Deal ends', async () => {
    const { cookie } = await brandWithBilling();
    const empty = await draft(cookie, {});
    const res = await api.send('post', `/api/deals/${empty}/publish`, cookie, {});
    expect(res.status).toBe(400);
    const message = (path: string) =>
      res.body.error.details.find((d: { path: string }) => d.path === path)?.message;
    expect(message('applicationDeadline')).toBe('Add a date for "Apply by"');
    expect(message('contentUploadDeadline')).toBe('Add a date for "Content due"');
    expect(message('dealDeadline')).toBe('Add a date for "Deal ends"');

    const reversed = await draft(cookie, {
      ...READY_DRAFT,
      applicationDeadline: '2026-10-20',
      contentUploadDeadline: '2026-10-15',
    });
    const second = await api.send('post', `/api/deals/${reversed}/publish`, cookie, {});
    const messages: string[] = second.body.error.details.map((d: { message: string }) => d.message);
    expect(messages).toContain('"Content due" must be after "Apply by"');
    expect(messages.join(' ')).not.toMatch(/application deadline|content upload deadline/i);
  });

  it('shows the same message as the reason PUBLISH is disabled on the draft', async () => {
    const { cookie } = await brandWithBilling();
    const id = await draft(cookie, { ...READY_DRAFT, applicationDeadline: null });
    const detail = await api.get(`/api/deals/${id}`, cookie);
    const publish = detail.body.deal.allowedActions.find(
      (a: { action: string }) => a.action === 'PUBLISH',
    );
    expect(publish).toMatchObject({ enabled: false, reason: 'Add a date for "Apply by"' });
  });
});

describe('POST /api/deals/:id/publish', () => {
  it('opens the deal, freezes the breakdown, records the event and sends email 1', async () => {
    const { cookie, user } = await brandWithBilling();
    const id = await draft(cookie);

    const res = await api.send('post', `/api/deals/${id}/publish`, cookie, {});
    expect(res.status).toBe(200);

    const expected = computeBreakdown(10_000_00, 0);
    expect(res.body.deal).toMatchObject({
      status: 'OPEN',
      budgetPaise: expected.budgetPaise,
      commissionBasePaise: expected.commissionBasePaise,
      commissionGstPaise: 0,
      commissionTotalPaise: expected.commissionTotalPaise,
      creatorAmountPaise: expected.creatorAmountPaise,
      advancePaise: expected.advancePaise,
      finalPaise: expected.finalPaise,
      publishedAt: NOW.toISOString(),
      applicationsOpen: true,
    });
    expect(expected.commissionTotalPaise + expected.advancePaise + expected.finalPaise).toBe(
      expected.budgetPaise,
    );

    const events = await db.select().from(dealEvents).where(eq(dealEvents.dealId, id));
    expect(events).toMatchObject([{ fromStatus: 'DRAFT', toStatus: 'OPEN', actorId: user.id }]);

    const emails = await sentEmails('DEAL_PUBLISHED');
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ toEmail: user.email, dealId: id, userId: user.id });
  });

  it('publishes at the ₹886 minimum with the 30 / 70 paise split frozen on the deal', async () => {
    const gstEnv = buildTestEnv({ GST_RATE_BPS: '1800', COMPANY_GSTIN: '29ABCDE1234F1Z5' });
    const gstApi = http(createApp(gstEnv, { now: () => NOW }));
    const { cookie } = await brandWithBilling();
    const id = await draft(cookie, { ...READY_DRAFT, budgetRupees: 886 });

    const res = await gstApi.send('post', `/api/deals/${id}/publish`, cookie, {});
    expect(res.status).toBe(200);
    expect(res.body.deal).toMatchObject({
      status: 'OPEN',
      budgetPaise: 88_600,
      commissionTotalPaise: 88_500,
      creatorAmountPaise: 100,
      advancePaise: 30,
      finalPaise: 70,
    });
  });

  it('uses the live GST rate and keeps it when the rate changes later', async () => {
    const gstEnv = buildTestEnv({ GST_RATE_BPS: '1800', COMPANY_GSTIN: '29ABCDE1234F1Z5' });
    const gstApi = http(createApp(gstEnv, { now: () => NOW }));
    const { cookie } = await brandWithBilling();
    const id = await draft(cookie);

    const published = (await gstApi.send('post', `/api/deals/${id}/publish`, cookie, {})).body.deal;
    const withGst = computeBreakdown(10_000_00, 1800);
    expect(published).toMatchObject({
      commissionGstPaise: withGst.commissionGstPaise,
      commissionTotalPaise: withGst.commissionTotalPaise,
      advancePaise: withGst.advancePaise,
      finalPaise: withGst.finalPaise,
    });
    expect(withGst.commissionGstPaise).toBeGreaterThan(0);

    // The rate goes back to 0: the published deal still shows what it was published with.
    const later = (await api.get(`/api/deals/${id}`, cookie)).body.deal;
    expect(later).toMatchObject({
      commissionGstPaise: withGst.commissionGstPaise,
      commissionTotalPaise: withGst.commissionTotalPaise,
      creatorAmountPaise: withGst.creatorAmountPaise,
      advancePaise: withGst.advancePaise,
      finalPaise: withGst.finalPaise,
    });
  });

  describe('validation', () => {
    it('lists every missing field', async () => {
      const { cookie } = await brandWithBilling();
      const id = await draft(cookie, {});
      const res = await api.send('post', `/api/deals/${id}/publish`, cookie, {});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual([
        'title',
        'description',
        'budgetRupees',
        'applicationDeadline',
        'contentUploadDeadline',
        'dealDeadline',
      ]);
    });

    it.each([
      ['a budget below the minimum', { budgetRupees: 885 }, 'budgetRupees'],
      [
        'an application deadline that has passed',
        { applicationDeadline: '2026-10-08' },
        'applicationDeadline',
      ],
      [
        'an application deadline after the upload deadline',
        { applicationDeadline: '2026-10-21' },
        'contentUploadDeadline',
      ],
      [
        'a deal deadline before the upload deadline',
        { dealDeadline: '2026-10-19' },
        'dealDeadline',
      ],
    ])('rejects %s', async (_name, override, path) => {
      const { cookie } = await brandWithBilling();
      const id = await draft(cookie, { ...READY_DRAFT, ...override });
      const res = await api.send('post', `/api/deals/${id}/publish`, cookie, {});
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual([path]);
      const [row] = await db.select().from(deals).where(eq(deals.id, id));
      expect(row?.status).toBe('DRAFT');
      expect(row?.commissionTotalPaise).toBeNull();
    });

    it('accepts today as the application deadline and a content upload equal to the deal deadline', async () => {
      const { cookie } = await brandWithBilling();
      const id = await draft(cookie, {
        ...READY_DRAFT,
        applicationDeadline: '2026-10-09',
        contentUploadDeadline: '2026-10-20',
        dealDeadline: '2026-10-20',
      });
      expect((await api.send('post', `/api/deals/${id}/publish`, cookie, {})).status).toBe(200);
    });

    it('rejects today once the day is over in IST', async () => {
      const late = http(createApp(env, { now: () => new Date('2026-10-09T18:30:00Z') }));
      const { cookie } = await brandWithBilling();
      const id = await draft(cookie, { ...READY_DRAFT, applicationDeadline: '2026-10-09' });
      expect((await late.send('post', `/api/deals/${id}/publish`, cookie, {})).status).toBe(400);
    });

    it('requires billing details', async () => {
      const { cookie, user } = await brandWithBilling();
      const id = await draft(cookie);
      await db.delete(brandBilling).where(eq(brandBilling.userId, user.id));
      const res = await api.send('post', `/api/deals/${id}/publish`, cookie, {});
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('BILLING_REQUIRED');
    });

    it('only publishes a draft', async () => {
      const { cookie, user } = await brandWithBilling();
      const open = await insertDeal(user.id, 'OPEN');
      const res = await api.send('post', `/api/deals/${open.id}/publish`, cookie, {});
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DEAL_NOT_DRAFT');
    });

    it('rejects a body', async () => {
      const { cookie } = await brandWithBilling();
      const id = await draft(cookie);
      const res = await api.send('post', `/api/deals/${id}/publish`, cookie, { foo: 1 });
      expect(res.status).toBe(400);
    });
  });

  describe('rate limit (10 per 24 hours)', () => {
    it('allows 10 publishes and answers 429 with Retry-After on the 11th', async () => {
      const { cookie } = await brandWithBilling();
      for (let i = 0; i < 10; i++) {
        const id = await draft(cookie);
        expect((await api.send('post', `/api/deals/${id}/publish`, cookie, {})).status).toBe(200);
      }
      const id = await draft(cookie);
      const res = await api.send('post', `/api/deals/${id}/publish`, cookie, {});
      expect(res.status).toBe(429);
      expect(res.body.error).toEqual({
        code: 'PUBLISH_LIMIT',
        message: 'You can publish up to 10 deals a day',
      });
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      const [row] = await db.select().from(deals).where(eq(deals.id, id));
      expect(row?.status).toBe('DRAFT');
    });

    it('does not count attempts that fail validation', async () => {
      const { cookie } = await brandWithBilling();
      const bad = await draft(cookie, {});
      for (let i = 0; i < 12; i++) {
        expect((await api.send('post', `/api/deals/${bad}/publish`, cookie, {})).status).toBe(400);
      }
      const good = await draft(cookie);
      expect((await api.send('post', `/api/deals/${good}/publish`, cookie, {})).status).toBe(200);
    });

    it('is per brand', async () => {
      const a = await brandWithBilling();
      const b = await brandWithBilling();
      for (let i = 0; i < 10; i++) {
        const id = await draft(a.cookie);
        await api.send('post', `/api/deals/${id}/publish`, a.cookie, {});
      }
      const id = await draft(b.cookie);
      expect((await api.send('post', `/api/deals/${id}/publish`, b.cookie, {})).status).toBe(200);
    });
  });

  it('lets only one of two parallel publishes win', async () => {
    const { cookie } = await brandWithBilling();
    const id = await draft(cookie);
    const [a, b] = await Promise.all([
      api.send('post', `/api/deals/${id}/publish`, cookie, {}),
      api.send('post', `/api/deals/${id}/publish`, cookie, {}),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await db.select().from(dealEvents).where(eq(dealEvents.dealId, id))).toHaveLength(1);
    expect(await sentEmails('DEAL_PUBLISHED')).toHaveLength(1);
  });
});
