import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { deals, sessions, users } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv({ ENABLE_DEV_LOGIN: 'true' });
const app = createApp(env);

beforeAll(async () => {
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await closeDb();
});

async function loginAsDevUser(username: string) {
  const response = await request(app)
    .post('/api/dev/login')
    .set('Origin', env.WEB_ORIGIN)
    .send({ username, role: 'BRAND' });
  const cookie = (response.headers['set-cookie'] as unknown as string[])
    .map((c) => c.split(';')[0])
    .join('; ');
  return { cookie, userId: response.body.user.id as string };
}

describe('DELETE /api/me', () => {
  it('401s when not authenticated', async () => {
    const response = await request(app).delete('/api/me').set('Origin', env.WEB_ORIGIN);
    expect(response.status).toBe(401);
  });

  it('soft-deletes, anonymizes, deletes sessions, and clears the cookie', async () => {
    const { cookie, userId } = await loginAsDevUser('deleteme');

    const response = await request(app)
      .delete('/api/me')
      .set('Origin', env.WEB_ORIGIN)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    // Cookie is cleared and the session is gone: it no longer authenticates.
    const meResponse = await request(app).get('/api/me').set('Cookie', cookie);
    expect(meResponse.status).toBe(401);

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user?.deletedAt).not.toBeNull();
    expect(user?.name).toBe('Deleted user');
    expect(user?.instagramUserId).toBeNull();

    const remainingSessions = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(remainingSessions).toHaveLength(0);
  });

  it('keeps deals referencing the deleted user', async () => {
    const { cookie, userId } = await loginAsDevUser('brandwithdeals');

    await db.insert(deals).values({
      shortId: 'DEAL0001',
      brandId: userId,
      title: 'A campaign',
      description: 'Details',
      applicationDeadline: '2026-01-01',
      contentUploadDeadline: '2026-01-15',
      dealDeadline: '2026-01-31',
    });

    await request(app).delete('/api/me').set('Origin', env.WEB_ORIGIN).set('Cookie', cookie);

    const remainingDeals = await db.select().from(deals).where(eq(deals.brandId, userId));
    expect(remainingDeals).toHaveLength(1);
    expect(remainingDeals[0]?.shortId).toBe('DEAL0001');
  });
});
