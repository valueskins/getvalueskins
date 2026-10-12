import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import {
  emailLoginCodes,
  emailVerificationTokens,
  sessions,
  users,
} from '../../src/db/schema/index.js';
import { cleanupJob } from '../../src/jobs/cleanup.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
import { DAY, RUN_AT, jobCtx } from './helpers.js';

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

const after = (ms: number) => new Date(RUN_AT.getTime() + ms);

describe('cleanup', () => {
  it('deletes expired sessions, verification links and email codes, and keeps the rest', async () => {
    const { user } = await createUserWithSession();
    await db.insert(sessions).values([
      { userId: user.id, tokenHash: 'expired-1', expiresAt: after(-1000) },
      { userId: user.id, tokenHash: 'expired-2', expiresAt: after(-DAY) },
      { userId: user.id, tokenHash: 'live', expiresAt: after(1000) },
    ]);
    const link = (hash: string, expiresAt: Date, usedAt: Date | null = null) => ({
      userId: user.id,
      email: 'a@example.com',
      tokenHash: hash,
      expiresAt,
      usedAt,
    });
    await db.insert(emailVerificationTokens).values([
      link('v-expired', after(-1000)),
      link('v-live', after(DAY)),
      // Used but not expired: left until it expires.
      link('v-used', after(DAY), after(-1000)),
    ]);
    const login = (hash: string, expiresAt: Date) => ({
      email: 'a@example.com',
      codeHash: hash,
      expiresAt,
    });
    await db
      .insert(emailLoginCodes)
      .values([
        login('c-expired', after(-1000)),
        login('c-expired-2', after(-DAY)),
        login('c-live', after(1000)),
      ]);

    const counts = await cleanupJob.run(jobCtx());

    expect(counts).toEqual({ sessions: 2, verifyLinks: 1, emailLogins: 2 });
    // createUserWithSession made one live session of its own.
    expect((await db.select().from(sessions)).map((s) => s.tokenHash)).toContain('live');
    expect((await db.select().from(sessions)).every((s) => s.expiresAt > RUN_AT)).toBe(true);
    expect(
      (await db.select().from(emailVerificationTokens)).map((t) => t.tokenHash).sort(),
    ).toEqual(['v-live', 'v-used']);
    expect((await db.select().from(emailLoginCodes)).map((c) => c.codeHash)).toEqual(['c-live']);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it('does nothing when nothing has expired', async () => {
    await createUserWithSession();
    expect(await cleanupJob.run(jobCtx())).toEqual({ sessions: 0, verifyLinks: 0, emailLogins: 0 });
  });
});
