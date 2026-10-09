import { resumeResponseSchema } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
import { NOW, brandWithBilling, creatorWithPayout, http, insertDeal } from '../helpers/deals.js';
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

const resume = (cookie: string, userId: string) => api.get(`/api/users/${userId}/resume`, cookie);

describe('GET /api/users/:id/resume', () => {
  it('returns the fetched Instagram profile for an Instagram account', async () => {
    const viewer = await brandWithBilling();
    const creator = await creatorWithPayout('ACTIVE', {
      profilePictureUrl: 'https://example.com/c.jpg',
    });

    const res = await resume(viewer.cookie, creator.user.id);
    expect(res.status).toBe(200);
    expect(resumeResponseSchema.parse(res.body).user).toEqual({
      id: creator.user.id,
      role: 'CREATOR',
      username: creator.user.username,
      name: creator.user.name,
      profilePictureUrl: 'https://example.com/c.jpg',
      instagramVerified: true,
      igAccountType: 'CREATOR',
      followersCount: 5000,
      engagementRate: 3.5,
    });
    expect(res.body.completedDeals).toEqual([]);
    expect(res.headers['cache-control']).toBe('private, max-age=300');
  });

  it('flags an email-only account as unverified and leaves the Instagram fields empty', async () => {
    const viewer = await brandWithBilling();
    const emailOnly = await creatorWithPayout('ACTIVE', {
      instagramUserId: null,
      igAccountType: null,
      followersCount: null,
      engagementRate: null,
      username: 'typed_handle',
    });
    const res = await resume(viewer.cookie, emailOnly.user.id);
    expect(res.body.user).toMatchObject({
      username: 'typed_handle',
      instagramVerified: false,
      igAccountType: null,
      followersCount: null,
      engagementRate: null,
      profilePictureUrl: null,
    });
  });

  it('lists the last 10 completed deals, newest first, with the other party', async () => {
    const viewer = await brandWithBilling();
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    for (let day = 1; day <= 12; day++) {
      await insertDeal(brand.user.id, 'COMPLETED', {
        creatorId: creator.user.id,
        title: `Deal day ${day}`,
        completedAt: new Date(`2026-09-${String(day).padStart(2, '0')}T10:00:00.000Z`),
      });
    }
    await insertDeal(brand.user.id, 'CANCELLED', { creatorId: creator.user.id });
    await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });

    const asCreator = (await resume(viewer.cookie, creator.user.id)).body;
    expect(asCreator.completedDeals).toHaveLength(10);
    expect(asCreator.completedDeals[0]).toEqual({
      counterparty: { id: brand.user.id, username: brand.user.username },
      budgetPaise: 10_000_00,
      title: 'Deal day 12',
      completedAt: '2026-09-12T10:00:00.000Z',
    });
    expect(asCreator.completedDeals[9].title).toBe('Deal day 3');

    const asBrand = (await resume(viewer.cookie, brand.user.id)).body;
    expect(asBrand.completedDeals).toHaveLength(10);
    expect(asBrand.completedDeals[0].counterparty).toEqual({
      id: creator.user.id,
      username: creator.user.username,
    });
  });

  it('shows a deleted counterparty as "Deleted user"', async () => {
    const viewer = await brandWithBilling();
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    await insertDeal(brand.user.id, 'COMPLETED', {
      creatorId: creator.user.id,
      completedAt: NOW,
    });
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, brand.user.id));

    const body = (await resume(viewer.cookie, creator.user.id)).body;
    expect(body.completedDeals[0].counterparty.username).toBe('Deleted user');
  });

  it('is a 404 for unknown, deleted and role-less users and for ids that are not UUIDs', async () => {
    const viewer = await brandWithBilling();
    const deleted = await creatorWithPayout();
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, deleted.user.id));
    const noRole = await createUserWithSession();

    expect((await resume(viewer.cookie, deleted.user.id)).status).toBe(404);
    expect((await resume(viewer.cookie, noRole.user.id)).status).toBe(404);
    expect((await resume(viewer.cookie, '01a11f37-1217-712d-962d-13a5004bd584')).status).toBe(404);
    expect((await resume(viewer.cookie, 'someone')).status).toBe(404);
  });

  it('needs a signed-in user, but not a finished onboarding', async () => {
    const creator = await creatorWithPayout();
    expect((await api.get(`/api/users/${creator.user.id}/resume`)).status).toBe(401);
    const newcomer = await createUserWithSession({ role: 'CREATOR' });
    expect((await resume(newcomer.cookie, creator.user.id)).status).toBe(200);
  });

  it('is cached for 5 minutes', async () => {
    const viewer = await brandWithBilling();
    const creator = await creatorWithPayout();
    const name = async () => (await resume(viewer.cookie, creator.user.id)).body.user.name;

    const original = creator.user.name;
    expect(await name()).toBe(original);

    await db.update(users).set({ name: 'Renamed' }).where(eq(users.id, creator.user.id));
    clock = new Date(NOW.getTime() + 4 * 60 * 1000 + 59 * 1000);
    expect(await name()).toBe(original);

    clock = new Date(NOW.getTime() + 5 * 60 * 1000);
    expect(await name()).toBe('Renamed');
  });
});
