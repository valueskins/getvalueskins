import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { buildTestEnv } from '../testEnv.js';

beforeAll(async () => {
  await resetDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe('POST /api/dev/login', () => {
  it('is not registered at all when ENABLE_DEV_LOGIN is false (plain 404, not a guarded route)', async () => {
    const app = createApp(buildTestEnv({ ENABLE_DEV_LOGIN: 'false' }));

    const response = await request(app)
      .post('/api/dev/login')
      .set('Origin', 'http://localhost:3000')
      .send({ username: 'someone', role: 'CREATOR' });

    expect(response.status).toBe(404);
  });

  it('is not registered when NODE_ENV is production, regardless of ENABLE_DEV_LOGIN', async () => {
    // createApp() only checks the flags directly (the process-exiting startup
    // guard that would normally forbid this combination is bypassed here on
    // purpose, to test createApp()'s own independent check).
    const app = createApp(
      buildTestEnv({
        NODE_ENV: 'production',
        ENABLE_DEV_LOGIN: 'true',
        RAZORPAY_KEY_ID: 'rzp_live_x',
      }),
    );

    const response = await request(app)
      .post('/api/dev/login')
      .set('Origin', 'http://localhost:3000')
      .send({ username: 'someone', role: 'CREATOR' });

    expect(response.status).toBe(404);
  });

  it('creates an admin outside production, who can open the admin API', async () => {
    const env = buildTestEnv({ ENABLE_DEV_LOGIN: 'true' });
    const app = createApp(env);
    const response = await request(app)
      .post('/api/dev/login')
      .set('Origin', env.WEB_ORIGIN)
      .send({ username: 'devadmin', role: 'BRAND', admin: true });
    expect(response.status).toBe(200);
    expect(response.body.user.isAdmin).toBe(true);
    const cookie = response.headers['set-cookie'] as unknown as string[];
    const admin = await request(app).get('/api/admin/deals').set('Cookie', cookie);
    expect(admin.status).toBe(200);
  });

  it('never turns an existing user into an admin', async () => {
    const env = buildTestEnv({ ENABLE_DEV_LOGIN: 'true' });
    const app = createApp(env);
    const login = (body: object) =>
      request(app).post('/api/dev/login').set('Origin', env.WEB_ORIGIN).send(body);
    expect((await login({ username: 'plainbrand', role: 'BRAND' })).body.user.isAdmin).toBe(false);
    const again = await login({ username: 'plainbrand', role: 'BRAND', admin: true });
    expect(again.body.user.isAdmin).toBe(false);
  });

  it('cannot create an admin, or anyone, in production even when the route is mounted', async () => {
    // Both the mount and the handler check: mount the router by hand with production flags.
    const { devLoginRoutes } = await import('../../src/auth/devLogin.routes.js');
    const express = (await import('express')).default;
    const env = buildTestEnv({
      NODE_ENV: 'production',
      ENABLE_DEV_LOGIN: 'true',
      RAZORPAY_KEY_ID: 'rzp_live_x',
    });
    const app = express();
    app.use(express.json());
    app.use(devLoginRoutes(env));
    app.use(
      (
        err: { status?: number },
        _req: unknown,
        res: { status: (n: number) => { end: () => void } },
        _next: unknown,
      ) => res.status(err.status ?? 500).end(),
    );
    const response = await request(app)
      .post('/api/dev/login')
      .send({ username: 'prodadmin', role: 'BRAND', admin: true });
    expect(response.status).toBe(404);
    const { db } = await import('../../src/db/client.js');
    const { users } = await import('../../src/db/schema/index.js');
    expect(await db.select().from(users)).toEqual([]);
  });

  it('creates a new user with fake Instagram data, sets a session cookie, and returns the user', async () => {
    const env = buildTestEnv({ ENABLE_DEV_LOGIN: 'true' });
    const app = createApp(env);

    const response = await request(app)
      .post('/api/dev/login')
      .set('Origin', env.WEB_ORIGIN)
      .send({ username: 'newcreator', role: 'CREATOR' });

    expect(response.status).toBe(200);
    expect(response.body.user.username).toBe('newcreator');
    expect(response.body.user.role).toBe('CREATOR');
    expect(response.body.user).not.toHaveProperty('igTokenEncrypted');
    expect(response.headers['set-cookie']?.[0]).toContain(env.SESSION_COOKIE_NAME);
  });

  it('logs an existing dev user back in without overwriting their locked role', async () => {
    const env = buildTestEnv({ ENABLE_DEV_LOGIN: 'true' });
    const app = createApp(env);

    const first = await request(app)
      .post('/api/dev/login')
      .set('Origin', env.WEB_ORIGIN)
      .send({ username: 'repeatlogin', role: 'CREATOR' });
    const second = await request(app)
      .post('/api/dev/login')
      .set('Origin', env.WEB_ORIGIN)
      .send({ username: 'repeatlogin', role: 'BRAND' });

    expect(second.body.user.id).toBe(first.body.user.id);
    expect(second.body.user.role).toBe('CREATOR');
  });

  it('rejects an invalid body with 400 VALIDATION_ERROR', async () => {
    const env = buildTestEnv({ ENABLE_DEV_LOGIN: 'true' });
    const app = createApp(env);

    const response = await request(app)
      .post('/api/dev/login')
      .set('Origin', env.WEB_ORIGIN)
      .send({ username: '', role: 'ADMIN' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(response.body.error.details)).toBe(true);
  });
});
