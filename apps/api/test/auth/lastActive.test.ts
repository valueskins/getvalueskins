import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
import { NOW } from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';

let clock = NOW;
const app = createApp(buildTestEnv(), { now: () => clock });

beforeAll(resetDb);
beforeEach(async () => {
  clock = NOW;
  await truncateAll();
});
afterAll(closeDb);

const lastActive = async (id: string) =>
  (await db.select().from(users).where(eq(users.id, id)))[0]!.lastActiveAt;
const visit = (cookie?: string) => {
  const req = request(app).get('/api/me');
  return cookie ? req.set('Cookie', cookie) : req;
};

describe('last_active_at', () => {
  it('is stamped by a signed-in request, and not by a signed-out one', async () => {
    const { user, cookie } = await createUserWithSession();
    expect(await lastActive(user.id)).toBeNull();

    await visit();
    expect(await lastActive(user.id)).toBeNull();

    await visit(cookie);
    expect((await lastActive(user.id))?.toISOString()).toBe(NOW.toISOString());
  });

  it('is not written again within the hour, and is once the hour has passed', async () => {
    const { user, cookie } = await createUserWithSession();
    await visit(cookie);

    clock = new Date(NOW.getTime() + 59 * 60 * 1000);
    await visit(cookie);
    expect((await lastActive(user.id))?.toISOString()).toBe(NOW.toISOString());

    clock = new Date(NOW.getTime() + 61 * 60 * 1000);
    await visit(cookie);
    expect((await lastActive(user.id))?.toISOString()).toBe(clock.toISOString());
  });

  it('is not sent to the client', async () => {
    const { cookie } = await createUserWithSession();
    const res = await visit(cookie);
    expect(JSON.stringify(res.body)).not.toContain('lastActiveAt');
    expect(JSON.stringify(res.body)).not.toContain('last_active');
  });
});
