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
    ['post', '/api/me/email'],
    ['post', '/api/me/email/resend'],
    ['post', '/api/me/email/verify'],
    ['put', '/api/me/billing'],
    ['put', '/api/me/profile'],
  ] as const)('%s %s answers 401 with no session', async (method, path) => {
    const response = await request(app)[method](path).set('Origin', origin).send({});
    expect(response.status).toBe(401);
  });
});

describe('the role and typed-username routes are gone', () => {
  it.each([
    ['/api/me/role', { role: 'BRAND' }],
    ['/api/me/instagram-username', { username: 'someone' }],
  ])('POST %s answers 404', async (path, body) => {
    const { cookie } = await instagramUser();
    expect((await post(path, cookie, body)).status).toBe(404);
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

  it('is for brands only: a creator gets 403 WRONG_ROLE, an account with no role gets 403 INSTAGRAM_NOT_CONNECTED', async () => {
    const creator = await instagramUser({ role: 'CREATOR', roleLockedAt: new Date() });
    const noRole = await instagramUser();

    const asCreator = await put(creator.cookie, billing);
    const withoutRole = await put(noRole.cookie, billing);

    expect(asCreator.status).toBe(403);
    expect(asCreator.body.error.code).toBe('WRONG_ROLE');
    expect(withoutRole.status).toBe(403);
    expect(withoutRole.body.error.code).toBe('INSTAGRAM_NOT_CONNECTED');
  });
});

describe('GET /api/me onboarding object and onboarding_completed_at', () => {
  const getMe = async (cookie: string) =>
    (await request(app).get('/api/me').set('Cookie', cookie)).body;
  const putProfile = (cookie: string, body: object) =>
    request(app).put('/api/me/profile').set('Origin', origin).set('Cookie', cookie).send(body);
  const creatorProfile = {
    name: 'Asha Rao',
    city: 'Pune',
    age: 24,
    gender: 'FEMALE',
    adultConfirmed: true,
  };

  const ids = (me: { onboarding: { steps: { id: string }[] } }) =>
    me.onboarding.steps.map((s) => s.id);

  it('Instagram creator: email, then profile, then an optional UPI step; no role step', async () => {
    const { user, cookie } = await instagramUser({
      role: 'CREATOR',
      igAccountType: 'MEDIA_CREATOR',
    });

    let me = await getMe(cookie);
    expect(ids(me)).toEqual(['instagram', 'email', 'profile', 'payout']);
    expect(me.onboarding.nextStep).toBe('email');
    expect(me.onboarding.completed).toBe(false);
    expect(me.profileDetails).toBeNull();

    await db
      .update(users)
      .set({ email: 'c@example.com', emailVerifiedAt: new Date() })
      .where(eq(users.id, user.id));
    me = await getMe(cookie);
    expect(me.onboarding.nextStep).toBe('profile');
    expect((await userRow(user.id)).onboardingCompletedAt).toBeNull();

    expect((await putProfile(cookie, creatorProfile)).status).toBe(200);
    me = await getMe(cookie);
    expect(me.onboarding.completed).toBe(true);
    expect(me.onboarding.nextStep).toBeNull();
    expect((await userRow(user.id)).onboardingCompletedAt).not.toBeNull();
  });

  it('Instagram brand: profile, then billing before it completes', async () => {
    const { user, cookie } = await instagramUser({
      role: 'BRAND',
      email: 'b@example.com',
      emailVerifiedAt: new Date(),
    });
    expect(ids(await getMe(cookie))).toEqual(['instagram', 'email', 'profile', 'billing']);

    await putProfile(cookie, {
      name: 'Brand Co',
      city: 'Goa',
      website: 'https://brand.example',
      adultConfirmed: true,
    });
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

  it('an email-only account has no role, so it cannot finish until Instagram is connected', async () => {
    const { user, cookie } = await emailUser();

    const me = await getMe(cookie);
    expect(ids(me)).toEqual(['instagram', 'email']);
    expect(me.onboarding.nextStep).toBe('instagram');
    expect(me.onboarding.completed).toBe(false);

    const profile = await putProfile(cookie, creatorProfile);
    expect(profile.status).toBe(403);
    expect(profile.body.error.code).toBe('INSTAGRAM_NOT_CONNECTED');
    expect((await userRow(user.id)).onboardingCompletedAt).toBeNull();
  });

  it('is set once and never unset', async () => {
    const { user, cookie } = await instagramUser({
      role: 'CREATOR',
      email: 'once@example.com',
      emailVerifiedAt: new Date(),
    });
    await putProfile(cookie, creatorProfile);
    const first = (await userRow(user.id)).onboardingCompletedAt;
    expect(first).not.toBeNull();

    await putProfile(cookie, creatorProfile);
    expect((await userRow(user.id)).onboardingCompletedAt?.getTime()).toBe(first?.getTime());
  });

  it('lists the payout step for a creator without making it required', async () => {
    const { cookie } = await instagramUser({ role: 'CREATOR' });
    const me = await getMe(cookie);

    expect(me.onboarding.steps.find((s: { id: string }) => s.id === 'payout')).toEqual({
      id: 'payout',
      done: false,
      required: false,
    });
  });
});
