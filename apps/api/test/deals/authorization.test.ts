import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
import {
  NOW,
  READY_DRAFT,
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

type Who =
  'anonymous' | 'brandNotOnboarded' | 'creatorNotOnboarded' | 'owner' | 'otherBrand' | 'creator';

interface Route {
  name: string;
  method: 'get' | 'post' | 'patch' | 'delete';
  path: (ids: { draft: string; open: string; application: string }) => string;
  body?: object;
  /** Expected status per kind of caller. `ok` is any 2xx. */
  expect: Partial<Record<Who, number | 'ok'>> & { anonymous: number };
}

const GUARDED_BRAND = {
  anonymous: 401,
  creator: 403,
  brandNotOnboarded: 403,
  creatorNotOnboarded: 403,
} as const;

const ROUTES: Route[] = [
  {
    name: 'POST /api/deals',
    method: 'post',
    path: () => '/api/deals',
    body: {},
    expect: { ...GUARDED_BRAND, owner: 'ok', otherBrand: 'ok' },
  },
  {
    name: 'PATCH /api/deals/:id',
    method: 'patch',
    path: (ids) => `/api/deals/${ids.draft}`,
    body: { title: 'x' },
    expect: { ...GUARDED_BRAND, owner: 'ok', otherBrand: 404 },
  },
  {
    name: 'DELETE /api/deals/:id',
    method: 'delete',
    path: (ids) => `/api/deals/${ids.draft}`,
    expect: { ...GUARDED_BRAND, owner: 'ok', otherBrand: 404 },
  },
  {
    name: 'POST /api/deals/:id/publish',
    method: 'post',
    path: (ids) => `/api/deals/${ids.draft}/publish`,
    body: {},
    expect: { ...GUARDED_BRAND, owner: 'ok', otherBrand: 404 },
  },
  {
    name: 'POST /api/deals/:id/cancel',
    method: 'post',
    path: (ids) => `/api/deals/${ids.open}/cancel`,
    body: { reason: 'x' },
    expect: { ...GUARDED_BRAND, owner: 'ok', otherBrand: 404 },
  },
  {
    name: 'GET /api/deals/feed',
    method: 'get',
    path: () => '/api/deals/feed',
    expect: {
      anonymous: 401,
      owner: 403,
      otherBrand: 403,
      brandNotOnboarded: 403,
      creatorNotOnboarded: 403,
      creator: 'ok',
    },
  },
  {
    name: 'GET /api/deals/mine',
    method: 'get',
    path: () => '/api/deals/mine',
    expect: {
      anonymous: 401,
      brandNotOnboarded: 403,
      creatorNotOnboarded: 403,
      owner: 'ok',
      creator: 'ok',
    },
  },
  {
    name: 'GET /api/deals/:id (OPEN)',
    method: 'get',
    path: (ids) => `/api/deals/${ids.open}`,
    expect: {
      anonymous: 401,
      brandNotOnboarded: 403,
      creatorNotOnboarded: 403,
      owner: 'ok',
      otherBrand: 'ok',
      creator: 'ok',
    },
  },
  {
    name: 'GET /api/deals/:id (DRAFT)',
    method: 'get',
    path: (ids) => `/api/deals/${ids.draft}`,
    expect: { anonymous: 401, owner: 'ok', otherBrand: 404, creator: 404 },
  },
  {
    name: 'POST /api/deals/:id/applications',
    method: 'post',
    path: (ids) => `/api/deals/${ids.open}/applications`,
    body: {},
    expect: {
      anonymous: 401,
      owner: 403,
      otherBrand: 403,
      brandNotOnboarded: 403,
      creatorNotOnboarded: 403,
      creator: 'ok',
    },
  },
  {
    name: 'GET /api/deals/:id/applications',
    method: 'get',
    path: (ids) => `/api/deals/${ids.open}/applications`,
    expect: {
      anonymous: 401,
      creator: 403,
      brandNotOnboarded: 403,
      creatorNotOnboarded: 403,
      owner: 'ok',
      otherBrand: 404,
    },
  },
  {
    name: 'GET /api/applications/mine',
    method: 'get',
    path: () => '/api/applications/mine',
    expect: {
      anonymous: 401,
      owner: 403,
      brandNotOnboarded: 403,
      creatorNotOnboarded: 403,
      creator: 'ok',
    },
  },
  {
    name: 'POST /api/applications/:id/confirm',
    method: 'post',
    path: (ids) => `/api/applications/${ids.application}/confirm`,
    body: {},
    expect: {
      anonymous: 401,
      creator: 403,
      brandNotOnboarded: 403,
      creatorNotOnboarded: 403,
      owner: 'ok',
      otherBrand: 404,
    },
  },
  {
    name: 'GET /api/users/:id/resume',
    method: 'get',
    path: () => '/api/users/RESUME_ID/resume',
    expect: {
      anonymous: 401,
      owner: 'ok',
      otherBrand: 'ok',
      creator: 'ok',
      brandNotOnboarded: 'ok',
    },
  },
  {
    name: 'GET /api/config',
    method: 'get',
    path: () => '/api/config',
    expect: { anonymous: 200, owner: 'ok', creator: 'ok' },
  },
];

const WHO: Who[] = [
  'anonymous',
  'brandNotOnboarded',
  'creatorNotOnboarded',
  'owner',
  'otherBrand',
  'creator',
];

describe('authorization on every deals, applications, resume and config endpoint', () => {
  it.each(ROUTES.map((route) => [route.name, route] as const))('%s', async (_name, route) => {
    // A fresh fixture per caller: a successful call can change the data (publish, cancel, delete).
    for (const who of WHO) {
      const expected = route.expect[who];
      if (expected === undefined) continue;

      const owner = await brandWithBilling();
      const otherBrand = await brandWithBilling();
      const creator = await creatorWithPayout();
      const draft = await insertDeal(owner.user.id, 'DRAFT', {
        ...READY_DRAFT,
        budgetPaise: 10_000_00,
      });
      const open = await insertDeal(owner.user.id, 'OPEN');
      const application = await insertApplication(open.id, (await creatorWithPayout()).user.id);
      const brandNotOnboarded = await createUserWithSession({ role: 'BRAND' });
      const creatorNotOnboarded = await createUserWithSession({ role: 'CREATOR' });

      const cookies: Record<Who, string | undefined> = {
        anonymous: undefined,
        brandNotOnboarded: brandNotOnboarded.cookie,
        creatorNotOnboarded: creatorNotOnboarded.cookie,
        owner: owner.cookie,
        otherBrand: otherBrand.cookie,
        creator: creator.cookie,
      };
      const path = route
        .path({ draft: draft.id, open: open.id, application: application.id })
        .replace('RESUME_ID', creator.user.id);
      const res =
        route.method === 'get'
          ? await api.get(path, cookies[who])
          : await api.send(route.method, path, cookies[who], route.body);

      const label = `${route.name} as ${who}: got ${res.status} ${JSON.stringify(res.body.error ?? '')}`;
      if (expected === 'ok') {
        expect(res.status, label).toBeGreaterThanOrEqual(200);
        expect(res.status, label).toBeLessThan(300);
      } else {
        expect(res.status, label).toBe(expected);
      }
    }
  });

  it('admins see any deal but get no actions on it', async () => {
    const owner = await brandWithBilling();
    const admin = await createUserWithSession({
      role: 'BRAND',
      isAdmin: true,
      onboardingCompletedAt: new Date(),
    });
    const draft = await insertDeal(owner.user.id, 'DRAFT');
    const res = await api.get(`/api/deals/${draft.id}`, admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body.deal.allowedActions).toEqual([]);
    expect((await api.send('delete', `/api/deals/${draft.id}`, admin.cookie)).status).toBe(404);
    expect(
      (await api.send('post', `/api/deals/${draft.id}/publish`, admin.cookie, {})).status,
    ).toBe(404);
  });
});
