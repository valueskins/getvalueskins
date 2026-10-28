import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../../src/app.js';
import { exchangeCodeForToken, exchangeForLongLivedToken } from '../../src/instagram/client.js';
import { InstagramApiError } from '../../src/instagram/errors.js';
import { instagramFailureLog } from '../../src/instagram/oauth.routes.js';
import { buildLogger } from '../../src/logging/logger.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { emailUser } from '../helpers/auth.js';
import { buildTestEnv } from '../testEnv.js';

const server = setupServer();

const DEFAULT_PROFILE = {
  user_id: 'ig-12345',
  username: 'creator_handle',
  name: 'Creator Name',
  account_type: 'BUSINESS',
  profile_picture_url: 'https://example.com/pic.jpg',
  followers_count: 5000,
  follows_count: 100,
  media_count: 40,
  biography: 'hi',
};

function mockInstagramHandlers(profileOverrides: Partial<typeof DEFAULT_PROFILE> = {}) {
  server.use(
    http.post('https://api.instagram.com/oauth/access_token', () =>
      HttpResponse.json({ access_token: 'short-lived-token', user_id: DEFAULT_PROFILE.user_id }),
    ),
    http.get('https://graph.instagram.com/access_token', () =>
      HttpResponse.json({
        access_token: 'long-lived-token',
        token_type: 'bearer',
        expires_in: 5_184_000,
      }),
    ),
    http.get('https://graph.instagram.com/me', () =>
      HttpResponse.json({ ...DEFAULT_PROFILE, ...profileOverrides }),
    ),
    http.get('https://graph.instagram.com/me/media', () =>
      HttpResponse.json({
        data: [
          { id: '1', like_count: 10, comments_count: 1 },
          { id: '2', like_count: 20, comments_count: 2 },
          { id: '3', like_count: 30, comments_count: 3 },
        ],
      }),
    ),
  );
}

async function startFlowWithState(
  app: ReturnType<typeof createApp>,
  extraCookie = '',
): Promise<{
  cookie: string;
  state: string;
}> {
  const response = await request(app).get('/api/auth/instagram/start').set('Cookie', extraCookie);
  const setCookie = response.headers['set-cookie'] as unknown as string[];
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const location = new URL(response.headers.location);
  const state = location.searchParams.get('state')!;
  return { cookie, state };
}

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(async () => {
  server.close();
  await closeDb();
});

describe('Instagram OAuth', () => {
  it('happy path: creates a new user, sets a session cookie, marks admin correctly', async () => {
    mockInstagramHandlers();
    const env = buildTestEnv({ ADMIN_INSTAGRAM_USER_IDS: DEFAULT_PROFILE.user_id });
    const app = createApp(env);

    const { cookie, state } = await startFlowWithState(app);

    const response = await request(app)
      .get(`/api/auth/instagram/callback?code=abc&state=${state}`)
      .set('Cookie', cookie);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${env.WEB_ORIGIN}/onboarding`);
    const setCookies = response.headers['set-cookie'] as unknown as string[];
    expect(setCookies.some((c) => c.includes(env.SESSION_COOKIE_NAME))).toBe(true);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.instagramUserId, DEFAULT_PROFILE.user_id));
    expect(user?.username).toBe('creator_handle');
    expect(user?.isAdmin).toBe(true);
    // The role comes from the account type (BUSINESS), never from the user.
    expect(user?.role).toBe('BRAND');
    expect(user?.igAccountType).toBe('BUSINESS');
  });

  it('rejects a bad/mismatched state', async () => {
    mockInstagramHandlers();
    const env = buildTestEnv();
    const app = createApp(env);

    const { cookie } = await startFlowWithState(app);

    const response = await request(app)
      .get('/api/auth/instagram/callback?code=abc&state=wrong-nonce')
      .set('Cookie', cookie);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${env.WEB_ORIGIN}/login?error=state_invalid`);

    const allUsers = await db.select().from(users);
    expect(allUsers).toHaveLength(0);
  });

  it('redirects with account_type_unsupported for a PERSONAL account', async () => {
    mockInstagramHandlers({ account_type: 'PERSONAL' });
    const env = buildTestEnv();
    const app = createApp(env);

    const { cookie, state } = await startFlowWithState(app);
    const response = await request(app)
      .get(`/api/auth/instagram/callback?code=abc&state=${state}`)
      .set('Cookie', cookie);

    expect(response.headers.location).toBe(
      `${env.WEB_ORIGIN}/login?error=account_type_unsupported`,
    );
    const allUsers = await db.select().from(users);
    expect(allUsers).toHaveLength(0);
  });

  it('redirects with instagram_failed on a generic Meta error', async () => {
    server.use(
      http.post('https://api.instagram.com/oauth/access_token', () =>
        HttpResponse.json(
          { error_message: 'bad code', error_type: 'OAuthException' },
          { status: 400 },
        ),
      ),
    );
    const env = buildTestEnv();
    const app = createApp(env);

    const { cookie, state } = await startFlowWithState(app);
    const response = await request(app)
      .get(`/api/auth/instagram/callback?code=abc&state=${state}`)
      .set('Cookie', cookie);

    expect(response.headers.location).toBe(`${env.WEB_ORIGIN}/login?error=instagram_failed`);
  });

  it('link mode attaches Instagram to the logged-in user without creating a new one', async () => {
    mockInstagramHandlers();
    const env = buildTestEnv({ ENABLE_DEV_LOGIN: 'true' });
    const app = createApp(env);

    const devLogin = await request(app)
      .post('/api/dev/login')
      .set('Origin', env.WEB_ORIGIN)
      .send({ username: 'emailonlyuser', role: 'CREATOR' });
    const sessionCookie = (devLogin.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    const existingUserId = devLogin.body.user.id;

    const startResponse = await request(app)
      .get('/api/auth/instagram/start?link=1')
      .set('Cookie', sessionCookie);
    const stateCookie = (startResponse.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    const state = new URL(startResponse.headers.location).searchParams.get('state')!;

    const response = await request(app)
      .get(`/api/auth/instagram/callback?code=abc&state=${state}`)
      .set('Cookie', `${sessionCookie}; ${stateCookie}`);

    expect(response.headers.location).toBe(`${env.WEB_ORIGIN}/home`);

    const [updated] = await db.select().from(users).where(eq(users.id, existingUserId));
    expect(updated?.instagramUserId).toBe(DEFAULT_PROFILE.user_id);

    const allUsers = await db.select().from(users);
    expect(allUsers).toHaveLength(1);
  });

  it('link mode gives an email-only account its role; onboarding then waits for the profile', async () => {
    mockInstagramHandlers();
    const env = buildTestEnv();
    const app = createApp(env);
    const { user, cookie: sessionCookie } = await emailUser();
    expect((await db.select().from(users).where(eq(users.id, user.id)))[0]?.role).toBeNull();

    const startResponse = await request(app)
      .get('/api/auth/instagram/start?link=1')
      .set('Cookie', sessionCookie);
    const stateCookie = (startResponse.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    const state = new URL(startResponse.headers.location).searchParams.get('state')!;
    await request(app)
      .get(`/api/auth/instagram/callback?code=abc&state=${state}`)
      .set('Cookie', `${sessionCookie}; ${stateCookie}`);

    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after?.instagramUserId).toBe(DEFAULT_PROFILE.user_id);
    expect(after?.role).toBe('BRAND');
    expect(after?.roleLockedAt).not.toBeNull();
    expect(after?.onboardingCompletedAt).toBeNull();

    const me = await request(app).get('/api/me').set('Cookie', sessionCookie);
    expect(me.body.onboarding.nextStep).toBe('profile');
  });

  it('link conflict: redirects without mutating either account', async () => {
    mockInstagramHandlers();
    const env = buildTestEnv({ ENABLE_DEV_LOGIN: 'true' });
    const app = createApp(env);

    // First, a real Instagram login takes the handle.
    const { cookie: firstCookie, state: firstState } = await startFlowWithState(app);
    await request(app)
      .get(`/api/auth/instagram/callback?code=abc&state=${firstState}`)
      .set('Cookie', firstCookie);

    // A second, different logged-in user tries to link the same Instagram account.
    const devLogin = await request(app)
      .post('/api/dev/login')
      .set('Origin', env.WEB_ORIGIN)
      .send({ username: 'someoneelse', role: 'BRAND' });
    const sessionCookie = (devLogin.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');

    const startResponse = await request(app)
      .get('/api/auth/instagram/start?link=1')
      .set('Cookie', sessionCookie);
    const stateCookie = (startResponse.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    const state = new URL(startResponse.headers.location).searchParams.get('state')!;

    const response = await request(app)
      .get(`/api/auth/instagram/callback?code=abc&state=${state}`)
      .set('Cookie', `${sessionCookie}; ${stateCookie}`);

    expect(response.headers.location).toBe(
      `${env.WEB_ORIGIN}/settings?error=account_linked_elsewhere`,
    );

    const linked = await db
      .select()
      .from(users)
      .where(eq(users.instagramUserId, DEFAULT_PROFILE.user_id));
    expect(linked).toHaveLength(1);
    expect(linked[0]?.username).toBe(DEFAULT_PROFILE.username);
  });

  it('re-login refreshes profile fields without resetting onboarding', async () => {
    mockInstagramHandlers();
    const env = buildTestEnv();
    const app = createApp(env);

    const first = await startFlowWithState(app);
    await request(app)
      .get(`/api/auth/instagram/callback?code=abc&state=${first.state}`)
      .set('Cookie', first.cookie);

    const [before] = await db
      .select()
      .from(users)
      .where(eq(users.instagramUserId, DEFAULT_PROFILE.user_id));
    await db
      .update(users)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(users.id, before!.id));

    mockInstagramHandlers({ followers_count: 9999 });
    const second = await startFlowWithState(app);
    const response = await request(app)
      .get(`/api/auth/instagram/callback?code=abc&state=${second.state}`)
      .set('Cookie', second.cookie);

    expect(response.headers.location).toBe(`${env.WEB_ORIGIN}/home`);

    const [after] = await db
      .select()
      .from(users)
      .where(eq(users.instagramUserId, DEFAULT_PROFILE.user_id));
    expect(after?.followersCount).toBe(9999);
    expect(after?.role).toBe('BRAND');
    expect(after?.onboardingCompletedAt).not.toBeNull();
  });
});

describe('the callback says which step Meta refused (SPEC 6.1)', () => {
  const unsupported = {
    error: {
      message: 'Unsupported request - method type: get',
      type: 'IGApiException',
      code: 100,
      fbtrace_id: 'AbCdEfTrace1',
    },
  };

  async function callback(env: ReturnType<typeof buildTestEnv>) {
    const app = createApp(env);
    const { cookie, state } = await startFlowWithState(app);
    return request(app)
      .get(`/api/auth/instagram/callback?code=abc&state=${state}`)
      .set('Cookie', cookie);
  }

  it('sends code 100 at the long-lived exchange to instagram_account_rejected', async () => {
    mockInstagramHandlers();
    server.use(
      http.get('https://graph.instagram.com/access_token', () =>
        HttpResponse.json(unsupported, { status: 400 }),
      ),
    );
    const env = buildTestEnv();
    const response = await callback(env);
    expect(response.headers.location).toBe(
      `${env.WEB_ORIGIN}/login?error=instagram_account_rejected`,
    );
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it('sends code 100 at the profile to instagram_account_rejected', async () => {
    mockInstagramHandlers();
    server.use(
      http.get('https://graph.instagram.com/me', () =>
        HttpResponse.json(unsupported, { status: 400 }),
      ),
    );
    const env = buildTestEnv();
    const response = await callback(env);
    expect(response.headers.location).toBe(
      `${env.WEB_ORIGIN}/login?error=instagram_account_rejected`,
    );
  });

  it('keeps instagram_failed for code 100 at the code exchange, and for other errors after it', async () => {
    mockInstagramHandlers();
    server.use(
      http.post('https://api.instagram.com/oauth/access_token', () =>
        HttpResponse.json(
          { error_type: 'OAuthException', code: 100, error_message: 'Invalid platform app' },
          { status: 400 },
        ),
      ),
    );
    const env = buildTestEnv();
    expect((await callback(env)).headers.location).toBe(
      `${env.WEB_ORIGIN}/login?error=instagram_failed`,
    );

    server.resetHandlers();
    mockInstagramHandlers();
    server.use(
      http.get('https://graph.instagram.com/me', () =>
        HttpResponse.json(
          { error: { message: 'Please retry', type: 'OAuthException', code: 2, fbtrace_id: 'x' } },
          { status: 500 },
        ),
      ),
    );
    expect((await callback(env)).headers.location).toBe(
      `${env.WEB_ORIGIN}/login?error=instagram_failed`,
    );
  });

  it("reads Meta's code, type, subcode and trace id from both error shapes", async () => {
    server.use(
      http.post('https://api.instagram.com/oauth/access_token', () =>
        HttpResponse.json(
          { error_type: 'OAuthException', code: 400, error_message: 'Invalid code' },
          { status: 400 },
        ),
      ),
      http.get('https://graph.instagram.com/access_token', () =>
        HttpResponse.json({ error: { ...unsupported.error, error_subcode: 33 } }, { status: 400 }),
      ),
    );
    const env = buildTestEnv();
    const flat = await exchangeCodeForToken('abc', env).catch((e: unknown) => e);
    expect(flat).toMatchObject({ metaCode: 400, metaType: 'OAuthException', httpStatus: 400 });
    const graph = await exchangeForLongLivedToken('short-lived-token', env).catch(
      (e: unknown) => e,
    );
    expect(graph).toMatchObject({
      metaCode: 100,
      metaType: 'IGApiException',
      metaSubcode: 33,
      fbtraceId: 'AbCdEfTrace1',
      httpStatus: 400,
    });
  });

  it("logs the step and Meta's error fields, and never the token, the sign-in code or the secret", () => {
    const lines: string[] = [];
    const log = buildLogger({ write: (line: string) => lines.push(line) });
    const error = new InstagramApiError('Unsupported request - method type: get', {
      metaCode: 100,
      metaType: 'IGApiException',
      metaSubcode: 33,
      fbtraceId: 'AbCdEfTrace1',
      httpStatus: 400,
    });
    error.step = 'long_lived_exchange';

    log.error(instagramFailureLog(error), 'instagram oauth callback failed');

    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({
      step: 'long_lived_exchange',
      metaNumber: 100,
      metaType: 'IGApiException',
      metaSubnumber: 33,
      fbtraceId: 'AbCdEfTrace1',
      httpStatus: 400,
    });
    expect(Object.keys(instagramFailureLog(error)).sort()).toEqual(
      ['fbtraceId', 'httpStatus', 'metaNumber', 'metaSubnumber', 'metaType', 'step'].sort(),
    );
    const env = buildTestEnv();
    for (const secret of ['short-lived-token', 'long-lived-token', env.INSTAGRAM_APP_SECRET]) {
      expect(lines[0]).not.toContain(secret);
    }
  });
});
