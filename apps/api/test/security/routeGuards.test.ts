import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { guardName } from '../../src/auth/guards.js';
import { ORIGIN_CHECK_EXEMPT_PATH_PREFIXES } from '../../src/security/originCheck.js';
import { adminUser } from '../admin/helpers.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
import { NOW, brandWithBilling, creatorWithPayout, http } from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';

/**
 * CLAUDE.md section 7: every route has a guard in the route itself, and a public route is on an
 * explicit allowlist. This walks the routes the running app actually registers (every optional
 * router switched on), so a new route cannot ship unguarded: it fails here until it is guarded, or
 * added to the allowlist below with a reason, and added to EXPECTED_ROUTES.
 */

/** Public routes, each with the reason it needs no session. Nothing else may be public. */
const PUBLIC_ROUTES: Record<string, string> = {
  'GET /api/health': 'Render health check',
  'GET /healthz': 'Render health check; must never touch the database',
  'GET /api/config': 'public config for the sign-in page and the breakdown preview',
  'POST /api/webhooks/razorpay': 'HMAC signature on the raw body, deduped by event id',
  'POST /api/meta/deauthorize': 'Meta signed_request, verified',
  'POST /api/meta/data-deletion': 'Meta signed_request, verified',
  'GET /api/meta/deletion-status/:code': 'unguessable confirmation code, returns a status only',
  'GET /api/auth/instagram/start': 'starts the sign-in; the state is bound to a cookie',
  'GET /api/auth/instagram/callback': 'finishes the sign-in; the state cookie is checked',
  'POST /api/auth/logout': 'ends a session; harmless without one',
  'POST /api/dev/login': 'development only: absent in production (startup guard)',
  'POST /api/auth/email/start': 'staging and tests only (AUTH_EMAIL_ENABLED); IP rate limited',
  'POST /api/auth/email/verify': 'staging and tests only (AUTH_EMAIL_ENABLED); IP rate limited',
  'POST /api/me/email/verify':
    'the emailed token proves the address; it never signs anyone in; IP rate limited',
};

/** Every route, with its guards and its dedicated rate limiter ("-" for none beyond the global one). */
const EXPECTED_ROUTES: string[] = [
  'DELETE /api/deals/:id | role:BRAND,requireOnboarded | -',
  'DELETE /api/me | requireUser | -',
  'GET /api/admin/deals | requireAdmin | -',
  'GET /api/admin/deals/:id | requireAdmin | -',
  'GET /api/admin/disputes | requireAdmin | -',
  'GET /api/admin/disputes/:id | requireAdmin | -',
  'GET /api/applications/mine | role:CREATOR,requireOnboarded | -',
  'GET /api/auth/instagram/callback | public | -',
  'GET /api/auth/instagram/start | public | -',
  'GET /api/config | public | -',
  'GET /api/deals/:id | requireOnboarded | -',
  'GET /api/deals/:id/applications | role:BRAND,requireOnboarded | -',
  'GET /api/deals/:id/direct-payment | role:BRAND,requireOnboarded | -',
  'GET /api/deals/:id/documents/:kind | requireUser | -',
  'GET /api/deals/:id/emails | requireUser | -',
  'GET /api/deals/:id/events | requireUser | -',
  'GET /api/deals/feed | role:CREATOR,requireOnboarded | -',
  'GET /api/deals/mine | requireOnboarded | -',
  'GET /api/health | public | -',
  'GET /healthz | public | -',
  'GET /api/me | requireUser | -',
  'GET /api/me/billing | role:BRAND | -',
  'GET /api/me/payout-upi | role:CREATOR | -',
  'GET /api/meta/deletion-status/:code | public | -',
  'GET /api/users/:id/resume | requireUser | -',
  'PATCH /api/deals/:id | role:BRAND,requireOnboarded | -',
  'POST /api/admin/deals/:id/cancel | requireAdmin | -',
  'POST /api/admin/disputes/:id/resolve | requireAdmin | -',
  'POST /api/admin/emails/:id/resend | requireAdmin | -',
  'POST /api/applications/:id/confirm | role:BRAND,requireOnboarded | -',
  'POST /api/auth/email/start | public | rateLimit:login',
  'POST /api/auth/email/verify | public | rateLimit:login',
  'POST /api/auth/logout | public | -',
  'POST /api/deals | role:BRAND,requireOnboarded | -',
  'POST /api/deals/:id/applications | role:CREATOR,requireOnboarded | -',
  'POST /api/deals/:id/approve | role:BRAND,requireOnboarded | -',
  'POST /api/deals/:id/cancel | role:BRAND,requireOnboarded | -',
  'POST /api/deals/:id/content | role:CREATOR,requireOnboarded | -',
  'POST /api/deals/:id/direct-payment | role:BRAND,requireOnboarded | rateLimit:direct-payment-record',
  'POST /api/deals/:id/disputes | requireUser,requireOnboarded | -',
  'POST /api/deals/:id/feedback | role:BRAND,requireOnboarded | -',
  'POST /api/deals/:id/payments/:type/order | role:BRAND,requireOnboarded | -',
  'POST /api/deals/:id/publish | role:BRAND,requireOnboarded | -',
  'POST /api/dev/login | public | -',
  'POST /api/direct-payments/:id/confirm | role:CREATOR,requireOnboarded | rateLimit:direct-payment-decision',
  'POST /api/direct-payments/:id/not-received | role:CREATOR,requireOnboarded | rateLimit:direct-payment-decision',
  'POST /api/me/email | requireUser | rateLimit:email-verification',
  'POST /api/me/email/resend | requireUser | rateLimit:email-verification',
  'POST /api/me/email/verify | public | rateLimit:email-verify',
  'POST /api/meta/data-deletion | public | -',
  'POST /api/meta/deauthorize | public | -',
  'POST /api/payments/verify | role:BRAND,requireOnboarded | -',
  'POST /api/webhooks/razorpay | public | -',
  'PUT /api/me/billing | role:BRAND | -',
  'PUT /api/me/payout-upi | role:CREATOR | rateLimit:payout-upi',
  'PUT /api/me/profile | requireUser | rateLimit:profile',
];

const AUTH_TAG = /^(requireUser|requireOnboarded|requireAdmin|role:(BRAND|CREATOR))$/;

interface RouteInfo {
  method: string;
  path: string;
  /** Auth guards in the order they run. */
  guards: string[];
  /** Dedicated rate limiters (the global per-user limiter is checked separately). */
  limiters: string[];
  /** Whether the global per-user limiter runs for the route. */
  globallyLimited: boolean;
}

interface Layer {
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: unknown }> };
  handle: unknown & { stack?: Layer[] };
}

/** Every route of the app, with the middleware that runs before it (Express 5 router internals). */
function collectRoutes(app: Express): RouteInfo[] {
  const out: RouteInfo[] = [];
  const walk = (stack: Layer[], inherited: string[]): void => {
    const local: string[] = [];
    for (const layer of stack) {
      if (layer.route) {
        const names = [
          ...inherited,
          ...local,
          ...layer.route.stack.map((l) => guardName(l.handle)),
        ];
        for (const method of Object.keys(layer.route.methods)) {
          out.push({
            method: method.toUpperCase(),
            path: layer.route.path,
            guards: names.filter((n) => AUTH_TAG.test(n)),
            limiters: names.filter((n) => n.startsWith('rateLimit:') && n !== 'rateLimit:user'),
            globallyLimited: names.includes('rateLimit:user'),
          });
        }
      } else if ((layer.handle as { stack?: Layer[] }).stack) {
        walk((layer.handle as { stack: Layer[] }).stack, [...inherited, ...local]);
      } else {
        local.push(guardName(layer.handle));
      }
    }
  };
  walk((app as unknown as { router: { stack: Layer[] } }).router.stack, []);
  return out;
}

const env = buildTestEnv({ AUTH_EMAIL_ENABLED: 'true', ENABLE_DEV_LOGIN: 'true' });
const app = createApp(env, { now: () => NOW });
const call = http(app);
const routes = collectRoutes(app);
const key = (r: RouteInfo) => `${r.method} ${r.path}`;
const isPublic = (r: RouteInfo) => key(r) in PUBLIC_ROUTES;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ID = '0197c0a0-0000-7000-8000-000000000000';
const urlOf = (path: string) =>
  path
    .replace(':kind', 'adp')
    .replace(':type', 'commission')
    .replace(':code', 'confirmation-code')
    .replace(/:id/g, ID);

describe('the route table', () => {
  it('finds the routes (the walk itself works)', () => {
    expect(routes.length).toBeGreaterThan(50);
    expect(routes.map(key)).toContain('POST /api/webhooks/razorpay');
    expect(routes.map(key)).toContain('GET /api/admin/deals');
  });

  it('matches the expected table: a new route, or a changed guard, must be added here on purpose', () => {
    const actual = routes
      .map((r) => {
        const guards = isPublic(r) ? 'public' : r.guards.join(',') || 'NONE';
        return `${key(r)} | ${guards} | ${r.limiters.join(',') || '-'}`;
      })
      .sort();
    expect(actual).toEqual([...EXPECTED_ROUTES].sort());
  });

  it('every route is behind the global per-user rate limiter, except the health check', () => {
    // The global limiter writes to PostgreSQL. Render calls /healthz every few seconds, so a
    // limiter in front of it would keep the free Neon database awake all day. Nothing else may skip it.
    const exempt = new Set(['GET /healthz']);
    expect(routes.filter((r) => !r.globallyLimited && !exempt.has(key(r))).map(key)).toEqual([]);
    expect(routes.filter((r) => r.globallyLimited && exempt.has(key(r))).map(key)).toEqual([]);
  });

  it('every route that is not on the public allowlist has an auth guard', () => {
    const unguarded = routes.filter((r) => !isPublic(r) && r.guards.length === 0).map(key);
    expect(unguarded).toEqual([]);
  });

  it('the allowlist names only routes that exist, and no public route carries an auth guard by mistake', () => {
    const existing = new Set(routes.map(key));
    expect(Object.keys(PUBLIC_ROUTES).filter((k) => !existing.has(k))).toEqual([]);
    expect(routes.filter((r) => isPublic(r) && r.guards.length > 0).map(key)).toEqual([]);
  });

  it('only the webhook and the Meta callbacks skip the Origin check, and each is on the allowlist', () => {
    const exempt = routes.filter((r) =>
      ORIGIN_CHECK_EXEMPT_PATH_PREFIXES.some((prefix) => r.path.startsWith(prefix)),
    );
    expect(exempt.map(key).sort()).toEqual([
      'GET /api/meta/deletion-status/:code',
      'POST /api/meta/data-deletion',
      'POST /api/meta/deauthorize',
      'POST /api/webhooks/razorpay',
    ]);
    expect(exempt.every(isPublic)).toBe(true);
  });
});

describe('the guards do what their tags say', () => {
  let brand: Awaited<ReturnType<typeof brandWithBilling>>;
  let creator: Awaited<ReturnType<typeof creatorWithPayout>>;
  let admin: Awaited<ReturnType<typeof adminUser>>;
  let newBrand: Awaited<ReturnType<typeof createUserWithSession>>;
  let newCreator: Awaited<ReturnType<typeof createUserWithSession>>;

  beforeAll(async () => {
    await resetDb();
    brand = await brandWithBilling();
    creator = await creatorWithPayout();
    admin = await adminUser();
    // Signed in, with a role, but onboarding not finished.
    newBrand = await createUserWithSession({ role: 'BRAND', roleLockedAt: new Date() });
    newCreator = await createUserWithSession({ role: 'CREATOR', roleLockedAt: new Date() });
  });
  afterAll(async () => {
    await truncateAll();
    await closeDb();
  });

  const send = (r: RouteInfo, cookie?: string) =>
    r.method === 'GET'
      ? call.get(urlOf(r.path), cookie)
      : call.send(r.method.toLowerCase() as 'post' | 'patch' | 'delete', urlOf(r.path), cookie, {});
  // PUT is not in the helper's list; supertest-backed `send` accepts it at runtime like the payout test.
  const protectedRoutes = routes.filter((r) => !isPublic(r));

  it.each(protectedRoutes.map((r) => [key(r), r] as const))(
    '%s: refuses a request with no session',
    async (_name, route) => {
      const res = await send(route);
      if (route.guards.includes('requireAdmin')) {
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      } else {
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      }
    },
  );

  it.each(
    protectedRoutes
      .filter((r) => r.guards.includes('requireAdmin'))
      .map((r) => [key(r), r] as const),
  )('%s: is a 404 for a brand, a creator and an unprivileged user', async (_name, route) => {
    for (const who of [brand, creator, newBrand]) {
      const res = await send(route, who.cookie);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
    expect((await send(route, admin.cookie)).status).not.toBe(401);
  });

  it.each(
    protectedRoutes
      .filter((r) => r.guards.some((g) => g.startsWith('role:')))
      .map((r) => [key(r), r] as const),
  )('%s: refuses the other role', async (_name, route) => {
    const role = route.guards.find((g) => g.startsWith('role:'))!.slice(5);
    const wrong = role === 'BRAND' ? creator : brand;
    const res = await send(route, wrong.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WRONG_ROLE');
  });

  it.each(
    protectedRoutes
      .filter((r) => r.guards.includes('requireOnboarded'))
      .map((r) => [key(r), r] as const),
  )('%s: refuses a user who has not finished onboarding', async (_name, route) => {
    const role = route.guards.find((g) => g.startsWith('role:'))?.slice(5);
    const who = role === 'CREATOR' ? newCreator : newBrand;
    const res = await send(route, who.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ONBOARDING_INCOMPLETE');
  });
});

describe('the public routes are public, and the Origin check covers every other mutating route', () => {
  const publicRoutes = routes.filter(isPublic);

  it.each(publicRoutes.map((r) => [key(r), r] as const))(
    '%s: answers without a session',
    async (_name, route) => {
      const res =
        route.method === 'GET'
          ? await call.get(urlOf(route.path))
          : await call.send(route.method.toLowerCase() as 'post', urlOf(route.path), undefined, {});
      expect([401, 404]).not.toContain(res.status);
    },
  );

  const mutating = routes.filter((r) => MUTATING.has(r.method));
  const exemptPrefix = (path: string) =>
    ORIGIN_CHECK_EXEMPT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));

  it.each(mutating.filter((r) => !exemptPrefix(r.path)).map((r) => [key(r), r] as const))(
    '%s: rejects a missing or foreign Origin',
    async (_name, route) => {
      for (const origin of [undefined, 'https://evil.example']) {
        const request = (await import('supertest')).default(app);
        const method = route.method.toLowerCase() as 'post' | 'put' | 'patch' | 'delete';
        const req = request[method](urlOf(route.path)).send({});
        if (origin) req.set('Origin', origin);
        const res = await req;
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('ORIGIN_MISMATCH');
      }
    },
  );
});
