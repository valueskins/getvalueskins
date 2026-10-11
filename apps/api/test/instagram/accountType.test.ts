import { eq, sql } from 'drizzle-orm';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { deals, users } from '../../src/db/schema/index.js';
import { AppError } from '../../src/errors/AppError.js';
import { upsertInstagramLogin } from '../../src/instagram/upsertUser.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
import { insertApplication, insertDeal } from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';

const server = setupServer();
const env = buildTestEnv();
const app = createApp(env);

const IG_ID = 'ig-type-1';

function profile(accountType: string | undefined, overrides: Record<string, unknown> = {}) {
  return {
    user_id: IG_ID,
    username: 'handle_one',
    name: 'Instagram Name',
    ...(accountType === undefined ? {} : { account_type: accountType }),
    profile_picture_url: 'https://example.com/pic.jpg',
    followers_count: 1000,
    follows_count: 10,
    media_count: 20,
    biography: 'hi',
    ...overrides,
  };
}

function mockInstagram(body: Record<string, unknown>) {
  server.use(
    http.post('https://api.instagram.com/oauth/access_token', () =>
      HttpResponse.json({ access_token: 'short-lived-token', user_id: IG_ID }),
    ),
    http.get('https://graph.instagram.com/access_token', () =>
      HttpResponse.json({ access_token: 'long-lived-token', expires_in: 5_184_000 }),
    ),
    http.get('https://graph.instagram.com/me', () => HttpResponse.json(body)),
    http.get('https://graph.instagram.com/me/media', () => HttpResponse.json({ data: [] })),
  );
}

const cookiesOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');

/** Runs the whole sign-in (or, with a session cookie, link) flow and returns where it redirected. */
async function signIn(body: Record<string, unknown>, sessionCookie?: string, link = false) {
  mockInstagram(body);
  const start = await request(app)
    .get(`/api/auth/instagram/start${link ? '?link=1' : ''}`)
    .set('Cookie', sessionCookie ?? '');
  const state = new URL(start.headers.location).searchParams.get('state')!;
  const cookie = [sessionCookie, cookiesOf(start)].filter(Boolean).join('; ');
  const res = await request(app)
    .get(`/api/auth/instagram/callback?code=abc&state=${state}`)
    .set('Cookie', cookie);
  return { location: res.headers.location as string, res };
}

const igUser = async () => {
  const [row] = await db.select().from(users).where(eq(users.instagramUserId, IG_ID));
  return row;
};

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
beforeEach(truncateAll);
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await closeDb();
});

describe('role from the Instagram account type (REPLACEMENT_PLAN 2.3)', () => {
  it.each([
    ['BUSINESS', 'BRAND'],
    ['MEDIA_CREATOR', 'CREATOR'],
  ])('a %s account signs in as a %s with no role question', async (type, role) => {
    const { location, res } = await signIn(profile(type));

    expect(location).toBe(`${env.WEB_ORIGIN}/onboarding`);
    const row = await igUser();
    expect(row).toMatchObject({ role, igAccountType: type });
    expect(row?.roleLockedAt).not.toBeNull();

    const cookie = cookiesOf(res);
    const me = await request(app).get('/api/me').set('Cookie', cookie);
    expect(me.body.user.role).toBe(role);
    expect(me.body.onboarding.steps.map((s: { id: string }) => s.id)).toEqual(
      role === 'BRAND'
        ? ['instagram', 'email', 'profile', 'billing']
        : ['instagram', 'email', 'profile', 'payout'],
    );
  });

  it.each([
    ['a personal account', 'PERSONAL'],
    ['no account type', undefined],
    ['an unknown account type', 'SOMETHING_NEW'],
  ])('refuses %s and creates no user', async (_label, type) => {
    const { location } = await signIn(profile(type));

    expect(location).toBe(`${env.WEB_ORIGIN}/login?error=account_type_unsupported`);
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it('a returning account with the same type keeps its role and refreshes Instagram data', async () => {
    await signIn(profile('BUSINESS'));
    const before = (await igUser())!;

    await signIn(profile('BUSINESS', { followers_count: 4321 }));

    const after = (await igUser())!;
    expect(after.role).toBe('BRAND');
    expect(after.roleLockedAt?.getTime()).toBe(before.roleLockedAt?.getTime());
    expect(after.followersCount).toBe(4321);
  });

  it('follows a changed type when the account has no deals or applications', async () => {
    await signIn(profile('BUSINESS'));
    const before = (await igUser())!;
    await db
      .update(users)
      .set({
        profileLockedAt: new Date(),
        city: 'Pune',
        website: 'https://brand.example',
        pitch: 'A pitch',
        adultConfirmedAt: new Date(),
        name: 'Brand Given Name',
      })
      .where(eq(users.id, before.id));

    const { location } = await signIn(profile('MEDIA_CREATOR'));

    expect(location).toBe(`${env.WEB_ORIGIN}/onboarding`);
    const after = (await igUser())!;
    expect(after.role).toBe('CREATOR');
    expect(after.igAccountType).toBe('MEDIA_CREATOR');
    // The brand's profile does not fit a creator, so it starts again and the Instagram name returns.
    expect(after).toMatchObject({
      profileLockedAt: null,
      city: null,
      website: null,
      pitch: null,
      adultConfirmedAt: null,
      name: 'Instagram Name',
    });
  });

  it.each([
    ['a brand with a draft deal', 'BUSINESS', 'MEDIA_CREATOR', 'brandDraft'],
    ['a brand with a published deal', 'BUSINESS', 'MEDIA_CREATOR', 'brandOpen'],
    ['a creator with an application', 'MEDIA_CREATOR', 'BUSINESS', 'application'],
    ['a creator with a confirmed deal', 'MEDIA_CREATOR', 'BUSINESS', 'creatorDeal'],
  ])('refuses a changed type for %s', async (_label, firstType, nextType, activity) => {
    await signIn(profile(firstType));
    const row = (await igUser())!;
    const other = await createUserWithSession({
      role: firstType === 'BUSINESS' ? 'CREATOR' : 'BRAND',
    });
    if (activity === 'brandDraft') await insertDeal(row.id, 'DRAFT');
    if (activity === 'brandOpen') await insertDeal(row.id, 'OPEN');
    if (activity === 'application') {
      const deal = await insertDeal(other.user.id, 'OPEN');
      await insertApplication(deal.id, row.id);
    }
    if (activity === 'creatorDeal') {
      await insertDeal(other.user.id, 'CONFIRMED', { creatorId: row.id });
    }

    const { location, res } = await signIn(profile(nextType, { followers_count: 777 }));

    expect(location).toBe(`${env.WEB_ORIGIN}/login?error=account_type_change_blocked`);
    expect(res.headers['set-cookie']?.toString()).not.toContain(env.SESSION_COOKIE_NAME);
    const after = (await igUser())!;
    expect(after.role).toBe(row.role);
    expect(after.igAccountType).toBe(firstType);
    expect(after.followersCount).toBe(row.followersCount);
  });

  it('keeps the name the user gave once the profile is locked, and refreshes it before then', async () => {
    await signIn(profile('MEDIA_CREATOR', { name: 'First Instagram Name' }));
    expect((await igUser())?.name).toBe('First Instagram Name');

    await signIn(profile('MEDIA_CREATOR', { name: 'Second Instagram Name' }));
    expect((await igUser())?.name).toBe('Second Instagram Name');

    await db
      .update(users)
      .set({ name: 'Asha Rao', profileLockedAt: new Date() })
      .where(eq(users.instagramUserId, IG_ID));
    await signIn(profile('MEDIA_CREATOR', { name: 'Third Instagram Name' }));
    expect((await igUser())?.name).toBe('Asha Rao');
  });

  it('an admin Instagram id still gets its role from the account type', async () => {
    const adminEnv = buildTestEnv({ ADMIN_INSTAGRAM_USER_IDS: IG_ID });
    const adminApp = createApp(adminEnv);
    mockInstagram(profile('MEDIA_CREATOR'));
    const start = await request(adminApp).get('/api/auth/instagram/start');
    const state = new URL(start.headers.location).searchParams.get('state')!;
    await request(adminApp)
      .get(`/api/auth/instagram/callback?code=abc&state=${state}`)
      .set('Cookie', cookiesOf(start));

    expect(await igUser()).toMatchObject({ isAdmin: true, role: 'CREATOR' });
  });

  it('link mode gives an email-only account its role from the account type', async () => {
    const email = await createUserWithSession({
      email: 'emailonly@example.com',
      emailVerifiedAt: new Date(),
    });

    const { location } = await signIn(profile('MEDIA_CREATOR'), email.cookie, true);

    expect(location).toBe(`${env.WEB_ORIGIN}/home`);
    const [row] = await db.select().from(users).where(eq(users.id, email.user.id));
    expect(row).toMatchObject({ role: 'CREATOR', igAccountType: 'MEDIA_CREATOR' });
  });

  it('link mode refuses an unsupported type and leaves the account as it was', async () => {
    const email = await createUserWithSession({
      email: 'emailonly@example.com',
      emailVerifiedAt: new Date(),
    });

    const { location } = await signIn(profile('PERSONAL'), email.cookie, true);

    expect(location).toBe(`${env.WEB_ORIGIN}/login?error=account_type_unsupported`);
    const [row] = await db.select().from(users).where(eq(users.id, email.user.id));
    expect(row?.instagramUserId).toBeNull();
    expect(row?.role).toBeNull();
  });

  it('link mode applies the change rule too', async () => {
    const brand = await createUserWithSession({ role: 'BRAND', email: 'b@example.com' });
    await insertDeal(brand.user.id, 'DRAFT');

    const { location } = await signIn(profile('MEDIA_CREATOR'), brand.cookie, true);

    expect(location).toBe(`${env.WEB_ORIGIN}/login?error=account_type_change_blocked`);
    const [row] = await db.select().from(users).where(eq(users.id, brand.user.id));
    expect(row?.role).toBe('BRAND');
    expect(row?.instagramUserId).toBeNull();
  });

  it('a deal created while the sign-in is running cannot slip past the check', async () => {
    await signIn(profile('BUSINESS'));
    const row = (await igUser())!;

    const fields = {
      encryptedToken: 'x',
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
      engagementRate: null,
      env,
    };
    let finished = false;
    const outcome = await db.transaction(async (tx) => {
      // The deal's foreign key to the brand conflicts with this lock, as it does for a real insert.
      await tx.execute(sql`select 1 from users where id = ${row.id} for update`);
      const login = upsertInstagramLogin({
        ...fields,
        profile: {
          userId: IG_ID,
          username: 'handle_one',
          name: 'Instagram Name',
          accountType: 'MEDIA_CREATOR',
          profilePictureUrl: null,
          followersCount: 1,
          followsCount: 1,
          mediaCount: 1,
          biography: null,
        },
      });
      const settled = login.then(
        () => 'done',
        (error: unknown) => error,
      );
      void settled.then(() => {
        finished = true;
      });
      // The sign-in waits for our lock, so it cannot have finished yet.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(finished).toBe(false);
      await tx.insert(deals).values({ shortId: 'RACE0001', brandId: row.id, status: 'DRAFT' });
      // Hand the promise out wrapped: returning it bare would wait for it before committing.
      return { settled };
    });

    const result = await outcome.settled;
    expect(result).toBeInstanceOf(AppError);
    expect((result as AppError).code).toBe('ACCOUNT_TYPE_CHANGE_BLOCKED');
    expect((await igUser())?.role).toBe('BRAND');
  });
});
