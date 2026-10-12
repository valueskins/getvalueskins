import { eq } from 'drizzle-orm';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema/index.js';
import {
  decryptInstagramToken,
  encryptInstagramToken,
} from '../../src/instagram/tokenEncryption.js';
import { instagramRefreshJob } from '../../src/jobs/instagramRefresh.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
import { buildTestEnv } from '../testEnv.js';
import { DAY, RUN_AT, ago, jobCtx } from './helpers.js';

const server = setupServer();
const env = buildTestEnv();

/** Per access token: what Meta answers. */
type Answer = { status?: number; body?: Record<string, unknown> };
let profiles: Record<string, Answer>;
let refreshes: Record<string, Answer>;
let calls: string[];

const profileFor = (userId: string, overrides: Record<string, unknown> = {}) => ({
  user_id: userId,
  username: `fresh_${userId}`,
  name: `Fresh Name ${userId}`,
  account_type: 'BUSINESS',
  profile_picture_url: 'https://example.com/new.jpg',
  followers_count: 2000,
  follows_count: 50,
  media_count: 30,
  biography: 'new bio',
  ...overrides,
});

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
  profiles = {};
  refreshes = {};
  calls = [];
  server.use(
    http.get('https://graph.instagram.com/me', ({ request }) => {
      const token = new URL(request.url).searchParams.get('access_token')!;
      calls.push(`me:${token}`);
      const answer = profiles[token] ?? {
        status: 400,
        body: { error: { message: 'x', code: 190 } },
      };
      return HttpResponse.json(answer.body ?? {}, { status: answer.status ?? 200 });
    }),
    http.get('https://graph.instagram.com/me/media', ({ request }) => {
      const token = new URL(request.url).searchParams.get('access_token')!;
      calls.push(`media:${token}`);
      return HttpResponse.json({
        data: [
          { like_count: 100, comments_count: 10 },
          { like_count: 100, comments_count: 10 },
          { like_count: 100, comments_count: 10 },
        ],
      });
    }),
    http.get('https://graph.instagram.com/refresh_access_token', ({ request }) => {
      const token = new URL(request.url).searchParams.get('access_token')!;
      calls.push(`refresh:${token}`);
      const answer = refreshes[token];
      if (answer) return HttpResponse.json(answer.body ?? {}, { status: answer.status ?? 200 });
      return HttpResponse.json({
        access_token: `${token}-renewed`,
        token_type: 'bearer',
        expires_in: 5_184_000,
      });
    }),
  );
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await closeDb();
});

let n = 0;
async function igUser(
  token: string,
  overrides: Partial<typeof users.$inferInsert> = {},
  answer?: Answer,
) {
  n += 1;
  const instagramUserId = `ig-refresh-${n}`;
  profiles[token] = answer ?? { body: profileFor(instagramUserId) };
  return createUserWithSession({
    instagramUserId,
    username: `old_${n}`,
    name: `Old Name ${n}`,
    role: 'CREATOR',
    roleLockedAt: new Date(),
    igAccountType: 'MEDIA_CREATOR',
    igTokenEncrypted: encryptInstagramToken(token, env),
    igTokenExpiresAt: new Date(RUN_AT.getTime() + 40 * DAY),
    lastActiveAt: ago(2 * DAY),
    followersCount: 10,
    ...overrides,
  });
}

const row = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0]!;

describe('instagram refresh: who is selected', () => {
  it('takes users active in the last 30 days with a token, and no one else', async () => {
    const active = await igUser('tok-active');
    const edge = await igUser('tok-edge', { lastActiveAt: ago(30 * DAY - 1000) });
    await igUser('tok-old', { lastActiveAt: ago(30 * DAY + 1000) });
    await igUser('tok-never', { lastActiveAt: null });
    await igUser('tok-deleted', { deletedAt: ago(DAY) });
    await igUser('tok-none', { igTokenEncrypted: null });
    await createUserWithSession({ email: 'emailonly@example.com', lastActiveAt: ago(DAY) });

    const counts = await instagramRefreshJob.run(jobCtx());

    expect(counts).toMatchObject({ selected: 2, refreshed: 2, failed: 0 });
    expect((await row(active.user.id)).followersCount).toBe(2000);
    expect((await row(edge.user.id)).followersCount).toBe(2000);
    expect(calls.filter((c) => c.startsWith('me:')).sort()).toEqual([
      'me:tok-active',
      'me:tok-edge',
    ]);
  });

  it('goes through the least recently synced first', async () => {
    await igUser('tok-b', { instagramSyncedAt: ago(DAY) });
    await igUser('tok-a', { instagramSyncedAt: null });
    await igUser('tok-c', { instagramSyncedAt: ago(5 * DAY) });

    await instagramRefreshJob.run(jobCtx());

    expect(calls.filter((c) => c.startsWith('me:'))).toEqual(['me:tok-a', 'me:tok-c', 'me:tok-b']);
  });
});

describe('instagram refresh: what it updates', () => {
  it('updates the Instagram fields and the sync time, and nothing about the account', async () => {
    const user = await igUser('tok-1', {
      isAdmin: true,
      profileLockedAt: null,
      city: 'Pune',
    });

    await instagramRefreshJob.run(jobCtx());

    const after = await row(user.user.id);
    expect(after).toMatchObject({
      username: `fresh_${user.user.instagramUserId}`,
      name: `Fresh Name ${user.user.instagramUserId}`,
      followersCount: 2000,
      followsCount: 50,
      mediaCount: 30,
      engagementRate: '5.50',
      bio: 'new bio',
      profilePictureUrl: 'https://example.com/new.jpg',
    });
    expect(after.instagramSyncedAt?.toISOString()).toBe(RUN_AT.toISOString());
    // Untouched: the role, the account type, the admin flag and the profile.
    expect(after).toMatchObject({
      role: 'CREATOR',
      igAccountType: 'MEDIA_CREATOR',
      isAdmin: true,
      city: 'Pune',
    });
  });

  it('keeps the name the user gave once the profile is locked', async () => {
    const user = await igUser('tok-1', {
      name: 'Asha Rao',
      profileLockedAt: ago(DAY),
      city: 'Pune',
    });
    await instagramRefreshJob.run(jobCtx());
    const after = await row(user.user.id);
    expect(after.name).toBe('Asha Rao');
    expect(after.followersCount).toBe(2000);
  });

  it('keeps the old handle when another linked account has the new one', async () => {
    await createUserWithSession({ instagramUserId: 'ig-other', username: 'fresh_ig-refresh-1' });
    n = 0;
    const user = await igUser('tok-1', { username: 'mine' });

    const counts = await instagramRefreshJob.run(jobCtx());

    expect(counts).toMatchObject({ refreshed: 1, failed: 0 });
    const after = await row(user.user.id);
    expect(after.username).toBe('mine');
    expect(after.followersCount).toBe(2000);
  });
});

describe('instagram refresh: the long-lived token', () => {
  it('renews it only when under 10 days remain, and saves the new one with its expiry', async () => {
    const soon = await igUser('tok-soon', {
      igTokenExpiresAt: new Date(RUN_AT.getTime() + 9 * DAY),
    });
    const later = await igUser('tok-later', {
      igTokenExpiresAt: new Date(RUN_AT.getTime() + 11 * DAY),
    });

    // The profile answer is for the renewed token.
    profiles['tok-soon-renewed'] = profiles['tok-soon']!;

    const counts = await instagramRefreshJob.run(jobCtx());

    expect(counts).toMatchObject({ renewed: 1, refreshed: 2 });
    expect(calls.filter((c) => c.startsWith('refresh:'))).toEqual(['refresh:tok-soon']);
    const renewedRow = await row(soon.user.id);
    expect(decryptInstagramToken(renewedRow.igTokenEncrypted!, env)).toBe('tok-soon-renewed');
    expect(renewedRow.igTokenExpiresAt?.toISOString()).toBe(
      new Date(RUN_AT.getTime() + 5_184_000 * 1000).toISOString(),
    );
    const untouched = await row(later.user.id);
    expect(decryptInstagramToken(untouched.igTokenEncrypted!, env)).toBe('tok-later');
  });

  it('saves a renewed token even if the profile call then fails', async () => {
    const user = await igUser('tok-soon', {
      igTokenExpiresAt: new Date(RUN_AT.getTime() + 2 * DAY),
    });
    profiles['tok-soon-renewed'] = { status: 500, body: { error: { message: 'down', code: 2 } } };

    const counts = await instagramRefreshJob.run(jobCtx());

    expect(counts).toMatchObject({ renewed: 1, failed: 1, refreshed: 0 });
    expect(decryptInstagramToken((await row(user.user.id)).igTokenEncrypted!, env)).toBe(
      'tok-soon-renewed',
    );
  });
});

describe('instagram refresh: when Meta objects', () => {
  it('clears a token Meta says is invalid (code 190), so it is not retried, and carries on', async () => {
    const dead = await igUser(
      'tok-dead',
      {},
      {
        status: 400,
        body: {
          error: { message: 'Invalid OAuth access token', type: 'OAuthException', code: 190 },
        },
      },
    );
    const fine = await igUser('tok-fine');

    const counts = await instagramRefreshJob.run(jobCtx());

    expect(counts).toMatchObject({ invalid: 1, refreshed: 1 });
    const deadRow = await row(dead.user.id);
    expect(deadRow.igTokenEncrypted).toBeNull();
    expect(deadRow.igTokenExpiresAt).toBeNull();
    expect(deadRow.instagramUserId).toBe(dead.user.instagramUserId);
    expect((await row(fine.user.id)).followersCount).toBe(2000);

    // Tomorrow it is not selected.
    calls.length = 0;
    expect(await instagramRefreshJob.run(jobCtx())).toMatchObject({ selected: 1 });
    expect(calls.some((c) => c.includes('tok-dead'))).toBe(false);
  });

  it.each([
    ['Meta code 4', 400, { error: { message: 'limit', code: 4 } }],
    ['Meta code 17', 400, { error: { message: 'limit', code: 17 } }],
    ['Meta code 32', 400, { error: { message: 'limit', code: 32 } }],
    ['Meta code 613', 400, { error: { message: 'limit', code: 613 } }],
    ['HTTP 429 with an empty body', 429, {}],
  ])(
    'stops the whole run on a rate limit (%s) and leaves the rest for tomorrow',
    async (_label, status, body) => {
      const first = await igUser('tok-1', { instagramSyncedAt: null });
      const limited = await igUser('tok-2', { instagramSyncedAt: ago(1 * DAY) }, { status, body });
      const rest = await igUser('tok-3', { instagramSyncedAt: ago(1 * DAY) });
      // Order: tok-1 (never synced), then tok-2 and tok-3 by id.
      void rest;

      const counts = await instagramRefreshJob.run(jobCtx());

      expect(counts).toMatchObject({ selected: 3, refreshed: 1, rateLimited: 1, failed: 0 });
      expect((await row(first.user.id)).followersCount).toBe(2000);
      expect((await row(limited.user.id)).igTokenEncrypted).not.toBeNull();
      expect((await row(rest.user.id)).followersCount).toBe(10);
      expect(calls.some((c) => c.includes('tok-3'))).toBe(false);
    },
  );

  it('counts another error as failed, keeps the token, and carries on', async () => {
    const broken = await igUser(
      'tok-broken',
      {},
      { status: 500, body: { error: { message: 'oops', code: 2 } } },
    );
    const fine = await igUser('tok-fine');

    const counts = await instagramRefreshJob.run(jobCtx());

    expect(counts).toMatchObject({ failed: 1, refreshed: 1, invalid: 0 });
    expect((await row(broken.user.id)).igTokenEncrypted).not.toBeNull();
    expect((await row(fine.user.id)).followersCount).toBe(2000);
  });

  it('skips a token that cannot be decrypted (a dev-login account)', async () => {
    const dev = await igUser('tok-dev', { igTokenEncrypted: 'dev-fake-token' });
    const counts = await instagramRefreshJob.run(jobCtx());
    expect(counts).toMatchObject({ selected: 1, skipped: 1, refreshed: 0, failed: 0 });
    expect((await row(dev.user.id)).followersCount).toBe(10);
    expect(calls).toEqual([]);
  });
});

describe('instagram refresh: pacing', () => {
  it('pauses between users, not before the first', async () => {
    await igUser('tok-1');
    await igUser('tok-2');
    await igUser('tok-3');
    const pauses: number[] = [];

    await instagramRefreshJob.run(
      jobCtx(RUN_AT, {
        sleep: async (ms) => {
          pauses.push(ms);
        },
      }),
    );

    expect(pauses).toEqual([250, 250]);
  });
});
