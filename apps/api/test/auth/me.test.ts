import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { meResponseSchema } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema/index.js';
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

  it('returns the fetched Instagram profile (never the token) for an Instagram user', async () => {
    const env = buildTestEnv({ ENABLE_DEV_LOGIN: 'true' });
    const app = createApp(env);

    const loginResponse = await request(app)
      .post('/api/dev/login')
      .set('Origin', env.WEB_ORIGIN)
      .send({ username: 'profile_user', role: 'CREATOR' });
    const cookie = loginResponse.headers['set-cookie'];
    await db
      .update(users)
      .set({
        name: 'Profile User',
        profilePictureUrl: 'https://example.com/pic.jpg',
        followersCount: 5000,
        followsCount: 100,
        mediaCount: 40,
        engagementRate: '3.25',
        instagramSyncedAt: new Date('2026-10-01T10:00:00.000Z'),
      })
      .where(eq(users.id, loginResponse.body.user.id));

    const meResponse = await request(app).get('/api/me').set('Cookie', cookie);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.profile).toEqual({
      username: 'profile_user',
      name: 'Profile User',
      profilePictureUrl: 'https://example.com/pic.jpg',
      followersCount: 5000,
      followsCount: 100,
      mediaCount: 40,
      engagementRate: 3.25,
      instagramSyncedAt: '2026-10-01T10:00:00.000Z',
    });
    expect(JSON.stringify(meResponse.body)).not.toContain('dev-fake-token');
    expect(meResponseSchema.safeParse(meResponse.body).success).toBe(true);
  });

  it('returns a null profile for an email-only user', async () => {
    const env = buildTestEnv({ AUTH_EMAIL_ENABLED: 'true' });
    const app = createApp(env);

    await db.insert(users).values({
      username: 'emailonly',
      name: 'emailonly',
      email: 'emailonly@example.com',
      emailVerifiedAt: new Date(),
    });
    // Sign in through the real email-code flow to get a session.
    await request(app)
      .post('/api/auth/email/start')
      .set('Origin', env.WEB_ORIGIN)
      .send({ email: 'emailonly@example.com' });
    const { emailLog } = await import('../../src/db/schema/index.js');
    const [log] = await db.select().from(emailLog);
    const code = log!.bodyText.match(/(\d{6})/)![1];
    const verify = await request(app)
      .post('/api/auth/email/verify')
      .set('Origin', env.WEB_ORIGIN)
      .send({ email: 'emailonly@example.com', code });

    const meResponse = await request(app)
      .get('/api/me')
      .set('Cookie', verify.headers['set-cookie']);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.profile).toBeNull();
    expect(meResponseSchema.safeParse(meResponse.body).success).toBe(true);
  });
});
