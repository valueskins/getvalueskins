import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createSession,
  deleteSessionByToken,
  findValidSession,
  refreshSessionIfStale,
} from '../../src/auth/session.js';
import { sessions, users } from '../../src/db/schema/index.js';
import { closeDb, db, resetDb, truncateAll } from '../db/testDb.js';

async function insertFixtureUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      instagramUserId: 'ig_session_fixture',
      username: 'session_fixture',
      name: 'Session Fixture',
      igAccountType: 'BUSINESS',
      igTokenEncrypted: 'x',
      igTokenExpiresAt: new Date('2027-01-01'),
    })
    .returning();
  if (!user) throw new Error('failed to insert fixture user');
  return user.id;
}

beforeAll(async () => {
  await resetDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe('session lifecycle', () => {
  it('creates a session that can be resolved back to the user', async () => {
    const userId = await insertFixtureUser();
    const token = await createSession({ userId });

    const resolved = await findValidSession(token);

    expect(resolved).not.toBeNull();
    expect(resolved?.user.id).toBe(userId);
    expect(resolved?.user.username).toBe('session_fixture');
  });

  it('returns null for an unknown token', async () => {
    const resolved = await findValidSession('not-a-real-token');
    expect(resolved).toBeNull();
  });

  it('returns null for an expired session', async () => {
    const userId = await insertFixtureUser();
    const token = await createSession({ userId });

    const [row] = await db.select().from(sessions).where(eq(sessions.userId, userId));
    if (!row) throw new Error('session row missing');
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, row.id));

    expect(await findValidSession(token)).toBeNull();
  });

  it('does not refresh a session that is not yet stale', async () => {
    const userId = await insertFixtureUser();
    const token = await createSession({ userId });
    const resolved = await findValidSession(token);
    if (!resolved) throw new Error('expected a resolved session');

    const refreshed = await refreshSessionIfStale(resolved.sessionId, resolved.expiresAt);
    expect(refreshed).toBeNull();
  });

  it('refreshes a session past the halfway point of its life', async () => {
    const userId = await insertFixtureUser();
    const token = await createSession({ userId });
    const resolved = await findValidSession(token);
    if (!resolved) throw new Error('expected a resolved session');

    // Simulate a session created 20 of its 30 days ago (past the 15-day halfway point).
    const staleExpiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await db
      .update(sessions)
      .set({ expiresAt: staleExpiresAt })
      .where(eq(sessions.id, resolved.sessionId));

    const refreshed = await refreshSessionIfStale(resolved.sessionId, staleExpiresAt);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.getTime()).toBeGreaterThan(staleExpiresAt.getTime());
  });

  it('deletes a session by token, so it can no longer be resolved', async () => {
    const userId = await insertFixtureUser();
    const token = await createSession({ userId });

    await deleteSessionByToken(token);

    expect(await findValidSession(token)).toBeNull();
  });
});
