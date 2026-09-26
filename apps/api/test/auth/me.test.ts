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

describe('GET /api/me', () => {
  it('401s with no session cookie', async () => {
    const app = createApp(buildTestEnv());
    const response = await request(app).get('/api/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the current user for a valid session', async () => {
    const env = buildTestEnv({ ENABLE_DEV_LOGIN: 'true' });
    const app = createApp(env);

    const loginResponse = await request(app)
      .post('/api/dev/login')
      .set('Origin', env.WEB_ORIGIN)
      .send({ username: 'me_test_user', role: 'BRAND' });
    const cookie = loginResponse.headers['set-cookie'];

    const meResponse = await request(app).get('/api/me').set('Cookie', cookie);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.username).toBe('me_test_user');
    expect(meResponse.body.user.role).toBe('BRAND');
  });
});
