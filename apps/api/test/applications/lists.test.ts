import {
  dealApplicationListResponseSchema,
  myApplicationListResponseSchema,
} from '@valueskins/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http,
  insertApplication,
  insertDeal,
} from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();
const api = http(createApp(env, { now: () => NOW }));

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

describe('GET /api/deals/:id/applications', () => {
  it('lists applicants for the deal brand, newest first, with a verified-Instagram flag', async () => {
    const brand = await brandWithBilling();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    const verified = await creatorWithPayout();
    const emailOnly = await creatorWithPayout('ACTIVE', {
      instagramUserId: null,
      igAccountType: null,
      followersCount: null,
      engagementRate: null,
    });
    await insertApplication(deal.id, verified.user.id);
    await insertApplication(deal.id, emailOnly.user.id);

    const res = await api.get(`/api/deals/${deal.id}/applications`, brand.cookie);
    expect(res.status).toBe(200);
    const parsed = dealApplicationListResponseSchema.parse(res.body);
    expect(parsed.items.map((i) => i.creator.id)).toEqual([emailOnly.user.id, verified.user.id]);
    expect(parsed.items[0]?.creator).toMatchObject({
      instagramVerified: false,
      followersCount: null,
      engagementRate: null,
    });
    expect(parsed.items[1]?.creator).toMatchObject({
      instagramVerified: true,
      followersCount: 5000,
      engagementRate: 3.5,
    });
    expect(JSON.stringify(res.body)).not.toContain('@example.com');
  });

  it('pages with a cursor', async () => {
    const brand = await brandWithBilling();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    for (let i = 0; i < 3; i++) {
      await insertApplication(deal.id, (await creatorWithPayout()).user.id);
    }
    const first = await api.get(`/api/deals/${deal.id}/applications?limit=2`, brand.cookie);
    expect(first.body.items).toHaveLength(2);
    const second = await api.get(
      `/api/deals/${deal.id}/applications?limit=2&cursor=${first.body.nextCursor}`,
      brand.cookie,
    );
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
  });

  it('is a 404 for another brand and a 403 for creators', async () => {
    const brand = await brandWithBilling();
    const other = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    expect((await api.get(`/api/deals/${deal.id}/applications`, other.cookie)).status).toBe(404);
    expect((await api.get(`/api/deals/${deal.id}/applications`, creator.cookie)).status).toBe(403);
  });
});

describe('GET /api/applications/mine', () => {
  it("lists a creator's applications with the deal summary, including deals that are no longer visible", async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const open = await insertDeal(brand.user.id, 'OPEN');
    const taken = await insertDeal(brand.user.id, 'CONFIRMED');
    await insertApplication(open.id, creator.user.id);
    await insertApplication(taken.id, creator.user.id, 'REJECTED');
    await insertApplication(
      (await insertDeal(brand.user.id, 'OPEN')).id,
      (await creatorWithPayout()).user.id,
    );

    const res = await api.get('/api/applications/mine', creator.cookie);
    expect(res.status).toBe(200);
    const parsed = myApplicationListResponseSchema.parse(res.body);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({
      status: 'REJECTED',
      deal: { id: taken.id, status: 'CONFIRMED', brand: { id: brand.user.id } },
    });
    expect(parsed.items[1]).toMatchObject({
      status: 'APPLIED',
      deal: { id: open.id, budgetPaise: open.budgetPaise },
    });
    // The deal itself is no longer visible to them.
    expect((await api.get(`/api/deals/${taken.id}`, creator.cookie)).status).toBe(404);
  });

  it('is for creators', async () => {
    const brand = await brandWithBilling();
    expect((await api.get('/api/applications/mine', brand.cookie)).status).toBe(403);
  });
});
