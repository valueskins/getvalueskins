import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { brandBilling, users } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { emailUser, instagramUser } from '../helpers/auth.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();
const app = createApp(env);
const origin = env.WEB_ORIGIN;

beforeAll(async () => {
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await closeDb();
});

async function userRow(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row!;
}

const post = (path: string, cookie: string, body: object) =>
  request(app).post(path).set('Origin', origin).set('Cookie', cookie).send(body);

describe('every onboarding route needs a session', () => {
  it.each([
    ['post', '/api/me/role'],
    ['post', '/api/me/instagram-username'],
    ['post', '/api/me/email'],
    ['post', '/api/me/email/resend'],
    ['post', '/api/me/email/verify'],
    ['put', '/api/me/billing'],
  ] as const)('%s %s answers 401 with no session', async (method, path) => {
    const response = await request(app)[method](path).set('Origin', origin).send({});
    expect(response.status).toBe(401);
  });
});

describe('POST /api/me/role', () => {
  it('sets the role once and locks it', async () => {
    const { user, cookie } = await instagramUser();

    const response = await post('/api/me/role', cookie, { role: 'CREATOR' });

    expect(response.status).toBe(200);
    const row = await userRow(user.id);
    expect(row.role).toBe('CREATOR');
    expect(row.roleLockedAt).not.toBeNull();
  });

  it('answers 409 ROLE_ALREADY_SET on a second call and never overwrites', async () => {
    const { user, cookie } = await instagramUser();
    await post('/api/me/role', cookie, { role: 'CREATOR' });

    const second = await post('/api/me/role', cookie, { role: 'BRAND' });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ROLE_ALREADY_SET');
    expect((await userRow(user.id)).role).toBe('CREATOR');
  });

  it('lets exactly one of two simultaneous requests win', async () => {
    const { user, cookie } = await instagramUser();

    const results = await Promise.all([
      post('/api/me/role', cookie, { role: 'CREATOR' }),
      post('/api/me/role', cookie, { role: 'BRAND' }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(['CREATOR', 'BRAND']).toContain((await userRow(user.id)).role);
  });

  it('rejects a role that is not CREATOR or BRAND', async () => {
    const { cookie } = await instagramUser();
    const response = await post('/api/me/role', cookie, { role: 'ADMIN' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('applies to email sign-in accounts too', async () => {
    const { user, cookie } = await emailUser();
    expect((await post('/api/me/role', cookie, { role: 'BRAND' })).status).toBe(200);
    expect((await userRow(user.id)).role).toBe('BRAND');
  });
});

describe('POST /api/me/instagram-username (email sign-in only)', () => {
  it('stores the normalized handle and marks the step done', async () => {
    const { user, cookie } = await emailUser({ username: 'placeholder' });

    const response = await post('/api/me/instagram-username', cookie, { username: '  @Jane.Doe ' });

    expect(response.status).toBe(200);
    const row = await userRow(user.id);
    expect(row.username).toBe('jane.doe');
    expect(row.instagramUsernameSetAt).not.toBeNull();
  });

  it('can be changed again until Instagram is connected', async () => {
    const { user, cookie } = await emailUser();
    await post('/api/me/instagram-username', cookie, { username: 'first' });
    const second = await post('/api/me/instagram-username', cookie, { username: 'second' });

    expect(second.status).toBe(200);
    expect((await userRow(user.id)).username).toBe('second');
  });

  it('does not require the handle to be unique (it is unverified)', async () => {
    const a = await emailUser();
    const b = await emailUser();
    expect(
      (await post('/api/me/instagram-username', a.cookie, { username: 'shared' })).status,
    ).toBe(200);
    expect(
      (await post('/api/me/instagram-username', b.cookie, { username: 'shared' })).status,
    ).toBe(200);
  });

  it('answers 409 INSTAGRAM_ALREADY_CONNECTED for an Instagram account', async () => {
    const { user, cookie } = await instagramUser({ username: 'realhandle' });

    const response = await post('/api/me/instagram-username', cookie, { username: 'other' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INSTAGRAM_ALREADY_CONNECTED');
    expect((await userRow(user.id)).username).toBe('realhandle');
  });

  it('rejects an invalid handle', async () => {
    const { cookie } = await emailUser();
    const response = await post('/api/me/instagram-username', cookie, { username: 'bad name!' });
    expect(response.status).toBe(400);
  });
});

describe('PUT /api/me/billing (brands)', () => {
  const billing = {
    billingName: 'Acme Pvt Ltd',
    billingAddress: '12 MG Road, Bengaluru',
    billingState: 'Karnataka',
  };
  const put = (cookie: string, body: object) =>
    request(app).put('/api/me/billing').set('Origin', origin).set('Cookie', cookie).send(body);

  it('saves billing details with a valid GSTIN', async () => {
    const { user, cookie } = await instagramUser({ role: 'BRAND', roleLockedAt: new Date() });

    const response = await put(cookie, { ...billing, gstin: '29ABCDE1234F1Z5' });

    expect(response.status).toBe(200);
    const [row] = await db.select().from(brandBilling).where(eq(brandBilling.userId, user.id));
    expect(row?.billingName).toBe('Acme Pvt Ltd');
    expect(row?.gstin).toBe('29ABCDE1234F1Z5');
  });

  it('accepts billing without a GSTIN (it is optional) and updates on a second call', async () => {
    const { user, cookie } = await instagramUser({ role: 'BRAND', roleLockedAt: new Date() });

    expect((await put(cookie, billing)).status).toBe(200);
    expect((await put(cookie, { ...billing, billingName: 'Acme Limited' })).status).toBe(200);

    const rows = await db.select().from(brandBilling).where(eq(brandBilling.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.billingName).toBe('Acme Limited');
    expect(rows[0]?.gstin).toBeNull();
  });

  it('rejects an invalid GSTIN and stores nothing', async () => {
    const { user, cookie } = await instagramUser({ role: 'BRAND', roleLockedAt: new Date() });

    const response = await put(cookie, { ...billing, gstin: 'not-a-gstin' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(
      await db.select().from(brandBilling).where(eq(brandBilling.userId, user.id)),
    ).toHaveLength(0);
  });

  it('rejects missing fields and unknown fields', async () => {
    const { cookie } = await instagramUser({ role: 'BRAND', roleLockedAt: new Date() });
    expect((await put(cookie, { billingName: 'Acme' })).status).toBe(400);
    expect((await put(cookie, { ...billing, extra: true })).status).toBe(400);
  });

  it('is for brands only: a creator gets 403 WRONG_ROLE, no role gets 403 ROLE_NOT_CHOSEN', async () => {
    const creator = await instagramUser({ role: 'CREATOR', roleLockedAt: new Date() });
    const noRole = await instagramUser();

    const asCreator = await put(creator.cookie, billing);
    const withoutRole = await put(noRole.cookie, billing);

    expect(asCreator.status).toBe(403);
    expect(asCreator.body.error.code).toBe('WRONG_ROLE');
    expect(withoutRole.status).toBe(403);
    expect(withoutRole.body.error.code).toBe('ROLE_NOT_CHOSEN');
  });
});

describe('GET /api/me onboarding object and onboarding_completed_at', () => {
  const getMe = async (cookie: string) =>
    (await request(app).get('/api/me').set('Cookie', cookie)).body;

  it('Instagram creator: role, then email (the email step is covered in emailVerification.test.ts)', async () => {
    const { user, cookie } = await instagramUser();

    let me = await getMe(cookie);
    expect(me.onboarding.nextStep).toBe('role');
    expect(me.onboarding.completed).toBe(false);

    await post('/api/me/role', cookie, { role: 'CREATOR' });
    me = await getMe(cookie);
    expect(me.onboarding.nextStep).toBe('email');
    expect((await userRow(user.id)).onboardingCompletedAt).toBeNull();
  });

  it('email creator: username, role; complete without needing an email step', async () => {
    const { user, cookie } = await emailUser();

    let me = await getMe(cookie);
    expect(me.onboarding.steps.map((s: { id: string }) => s.id)).toEqual([
      'instagram_username',
      'role',
      'email',
    ]);
    expect(me.onboarding.nextStep).toBe('instagram_username');

    await post('/api/me/instagram-username', cookie, { username: 'creator1' });
    me = await getMe(cookie);
    expect(me.onboarding.nextStep).toBe('role');
    expect((await userRow(user.id)).onboardingCompletedAt).toBeNull();

    await post('/api/me/role', cookie, { role: 'CREATOR' });
    me = await getMe(cookie);
    expect(me.onboarding.completed).toBe(true);
    expect(me.onboarding.nextStep).toBeNull();
    expect((await userRow(user.id)).onboardingCompletedAt).not.toBeNull();
  });

  it('email brand: also needs billing before it completes', async () => {
    const { user, cookie } = await emailUser();
    await post('/api/me/instagram-username', cookie, { username: 'brand1' });
    await post('/api/me/role', cookie, { role: 'BRAND' });

    expect((await getMe(cookie)).onboarding.nextStep).toBe('billing');
    expect((await userRow(user.id)).onboardingCompletedAt).toBeNull();

    await request(app)
      .put('/api/me/billing')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ billingName: 'Brand Co', billingAddress: '1 Road', billingState: 'Goa' });

    expect((await getMe(cookie)).onboarding.completed).toBe(true);
    expect((await userRow(user.id)).onboardingCompletedAt).not.toBeNull();
  });

  it('is set once and never unset', async () => {
    const { user, cookie } = await emailUser();
    await post('/api/me/instagram-username', cookie, { username: 'stays' });
    await post('/api/me/role', cookie, { role: 'CREATOR' });
    const first = (await userRow(user.id)).onboardingCompletedAt;
    expect(first).not.toBeNull();

    await post('/api/me/instagram-username', cookie, { username: 'changed' });
    expect((await userRow(user.id)).onboardingCompletedAt?.getTime()).toBe(first?.getTime());
  });

  it('lists the payout step for a creator without making it required', async () => {
    const { cookie } = await emailUser({ instagramUsernameSetAt: new Date(), role: 'CREATOR' });
    const me = await getMe(cookie);

    expect(me.onboarding.steps.find((s: { id: string }) => s.id === 'payout')).toEqual({
      id: 'payout',
      done: false,
      required: false,
    });
  });
});
