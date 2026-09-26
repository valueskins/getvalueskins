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

describe('POST /api/auth/logout', () => {
  it('is tolerant of a missing session (no requireUser — always 200)', async () => {
    const env = buildTestEnv();
    const app = createApp(env);

    const response = await request(app).post('/api/auth/logout').set('Origin', env.WEB_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('deletes the session row, so the cookie no longer authenticates afterward', async () => {
    const env = buildTestEnv({ ENABLE_DEV_LOGIN: 'true' });
    const app = createApp(env);

    const loginResponse = await request(app)
      .post('/api/dev/login')
      .set('Origin', env.WEB_ORIGIN)
      .send({ username: 'logout_test_user', role: 'CREATOR' });
    const cookie = loginResponse.headers['set-cookie'];

    const logoutResponse = await request(app)
      .post('/api/auth/logout')
      .set('Origin', env.WEB_ORIGIN)
      .set('Cookie', cookie);
    expect(logoutResponse.status).toBe(200);

    const meResponse = await request(app).get('/api/me').set('Cookie', cookie);
    expect(meResponse.status).toBe(401);
  });
});
