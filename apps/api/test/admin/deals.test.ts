import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, brandWithBilling, creatorWithPayout, http, insertDeal } from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';
import { adminUser } from './helpers.js';

const env = buildTestEnv();
const api = http(createApp(env, { now: () => NOW }));

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

describe('GET /api/admin/deals', () => {
  it('lists every deal newest first, drafts included, with brand and creator', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const draft = await insertDeal(brand.user.id, 'DRAFT');
    const open = await insertDeal(brand.user.id, 'OPEN');
    const paid = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });

    const res = await api.get('/api/admin/deals', admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body.items.map((d: { id: string }) => d.id)).toEqual([paid.id, open.id, draft.id]);
    expect(res.body.items[0]).toMatchObject({
      shortId: paid.shortId,
      status: 'ADVANCE_PAID',
      brand: { id: brand.user.id, username: brand.user.username },
      creator: { id: creator.user.id, username: creator.user.username },
    });
    expect(res.body.items[1].creator).toBeNull();
  });

  it('filters by status', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    await insertDeal(brand.user.id, 'OPEN');
    const approved = await insertDeal(brand.user.id, 'APPROVED');
    const res = await api.get('/api/admin/deals?status=APPROVED', admin.cookie);
    expect(res.body.items.map((d: { id: string }) => d.id)).toEqual([approved.id]);
    expect((await api.get('/api/admin/deals?status=LOST', admin.cookie)).status).toBe(400);
  });

  it('searches by short id: exact, prefix, any case, no wildcards', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    const a = await insertDeal(brand.user.id, 'OPEN', { shortId: 'ABCD2345' });
    const b = await insertDeal(brand.user.id, 'OPEN', { shortId: 'ABCE6789' });
    await insertDeal(brand.user.id, 'OPEN', { shortId: 'ZZZZ2222' });
    const ids = async (q: string) =>
      (await api.get(`/api/admin/deals?q=${encodeURIComponent(q)}`, admin.cookie)).body.items.map(
        (d: { id: string }) => d.id,
      );

    expect(await ids('ABCD2345')).toEqual([a.id]);
    expect(await ids('abcd2345')).toEqual([a.id]);
    expect((await ids('ABC')).sort()).toEqual([a.id, b.id].sort());
    expect(await ids('NOPE')).toEqual([]);
    expect(await ids('%')).toEqual([]);
    expect(await ids('_BCD2345')).toEqual([]);
  });

  it('combines the filters and pages without gaps or repeats', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    const open: string[] = [];
    for (let i = 0; i < 5; i++) open.push((await insertDeal(brand.user.id, 'OPEN')).id);
    await insertDeal(brand.user.id, 'CONFIRMED', {
      creatorId: (await creatorWithPayout()).user.id,
    });

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { body: { items: { id: string }[]; nextCursor: string | null } } = await api.get(
        `/api/admin/deals?status=OPEN&limit=2${cursor ? `&cursor=${cursor}` : ''}`,
        admin.cookie,
      );
      seen.push(...page.body.items.map((d) => d.id));
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(seen).toEqual([...open].reverse());
  });
});

describe('GET /api/admin/deals/:id', () => {
  it("returns the deal with its events, payments, direct payments, emails and disputes, and only this deal's", async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'CONTENT_UPLOADED', {
      creatorId: creator.user.id,
    });
    const other = await insertDeal(brand.user.id, 'CONTENT_UPLOADED', {
      creatorId: creator.user.id,
    });
    for (const target of [deal, other]) {
      await api.send('post', `/api/deals/${target.id}/disputes`, brand.cookie, {
        subject: `About ${target.shortId}`,
        description: 'Details',
      });
    }
    await api.send('post', `/api/admin/deals/${other.id}/cancel`, admin.cookie, { note: 'Other' });

    const res = await api.get(`/api/admin/deals/${deal.id}`, admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body.deal).toMatchObject({ id: deal.id, status: 'CONTENT_UPLOADED' });
    expect(res.body.events).toEqual([]);
    expect(res.body.payments).toEqual([]);
    expect(res.body.directPayments).toEqual([]);
    expect(res.body.disputes).toHaveLength(1);
    expect(res.body.disputes[0]).toMatchObject({ subject: `About ${deal.shortId}` });
    expect(res.body.emails).toHaveLength(1);
    expect(res.body.emails[0]).toMatchObject({
      template: 'DISPUTE_RAISED',
      toEmail: env.DISPUTE_EMAIL,
      status: 'SENT',
    });
    expect(res.body.emails[0].cc.sort()).toEqual([brand.user.email, creator.user.email].sort());

    const cancelled = await api.get(`/api/admin/deals/${other.id}`, admin.cookie);
    expect(cancelled.body.events).toMatchObject([
      { fromStatus: 'CONTENT_UPLOADED', toStatus: 'CANCELLED', actorType: 'ADMIN', note: 'Other' },
    ]);
    expect(cancelled.body.events[0].actorUsername).toBe(admin.user.username);
  });

  it('is 404 for an unknown or malformed id', async () => {
    const admin = await adminUser();
    expect(
      (await api.get('/api/admin/deals/0197c0a0-0000-7000-8000-000000000000', admin.cookie)).status,
    ).toBe(404);
    expect((await api.get('/api/admin/deals/nope', admin.cookie)).status).toBe(404);
  });
});
