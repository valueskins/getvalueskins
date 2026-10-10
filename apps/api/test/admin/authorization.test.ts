import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, brandWithBilling, creatorWithPayout, http } from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';
import { adminUser } from './helpers.js';

const env = buildTestEnv();
const api = http(createApp(env, { now: () => NOW }));

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

const ID = '0197c0a0-0000-7000-8000-000000000000';

/** Every admin route (SPEC 16), with a body that would pass validation. */
const ROUTES: Array<{ method: 'get' | 'post'; path: string; body?: object }> = [
  { method: 'get', path: '/api/admin/deals' },
  { method: 'get', path: `/api/admin/deals/${ID}` },
  { method: 'post', path: `/api/admin/deals/${ID}/cancel`, body: { note: 'x' } },
  { method: 'post', path: `/api/admin/transfers/${ID}/retry`, body: {} },
  { method: 'post', path: `/api/admin/transfers/${ID}/mark-manual`, body: { reference: 'UTR1' } },
  { method: 'post', path: `/api/admin/emails/${ID}/resend`, body: {} },
  { method: 'get', path: '/api/admin/disputes' },
  { method: 'post', path: `/api/admin/disputes/${ID}/resolve`, body: { resolution: 'x' } },
];

function call(route: (typeof ROUTES)[number], cookie?: string) {
  return route.method === 'get'
    ? api.get(route.path, cookie)
    : api.send('post', route.path, cookie, route.body);
}

describe('admin routes answer 404 to everyone who is not an admin', () => {
  it.each(ROUTES.map((r) => [`${r.method.toUpperCase()} ${r.path}`, r] as const))(
    '%s',
    async (_name, route) => {
      const brand = await brandWithBilling();
      const creator = await creatorWithPayout();
      const flagFalse = await brandWithBilling({ isAdmin: false });

      const signedOut = await call(route);
      expect(signedOut.status).toBe(404);
      for (const who of [brand, creator, flagFalse]) {
        const res = await call(route, who.cookie);
        expect(res.status).toBe(404);
        expect(res.body).toEqual(signedOut.body);
      }
      expect(signedOut.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    },
  );

  it('an admin gets past the guard on every route (404 only because the id does not exist)', async () => {
    const admin = await adminUser();
    for (const route of ROUTES) {
      const res = await call(route, admin.cookie);
      expect([200, 404], `${route.method} ${route.path}`).toContain(res.status);
      if (res.status === 404) expect(res.body.error.code).toBe('NOT_FOUND');
    }
    expect((await call(ROUTES[0]!, admin.cookie)).status).toBe(200);
    expect((await call(ROUTES[6]!, admin.cookie)).status).toBe(200);
  });
});
