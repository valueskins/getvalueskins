import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { emailUser, instagramUser } from '../helpers/auth.js';
import { NOW } from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();
let clock = NOW;
const app = createApp(env, { now: () => clock });
const origin = env.WEB_ORIGIN;

beforeAll(resetDb);
beforeEach(async () => {
  clock = NOW;
  await truncateAll();
});
afterAll(closeDb);

const put = (cookie: string | undefined, body: object) => {
  const req = request(app).put('/api/me/profile').set('Origin', origin);
  return (cookie ? req.set('Cookie', cookie) : req).send(body);
};
const getMe = async (cookie: string) =>
  (await request(app).get('/api/me').set('Cookie', cookie)).body;
const row = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0]!;

let n = 0;
const creator = () =>
  instagramUser({
    role: 'CREATOR',
    igAccountType: 'MEDIA_CREATOR',
    name: 'Instagram Name',
    email: `creator${++n}@example.com`,
    emailVerifiedAt: new Date(),
  });
const brand = () =>
  instagramUser({
    role: 'BRAND',
    name: 'Instagram Brand',
    email: `brand${++n}@example.com`,
    emailVerifiedAt: new Date(),
  });

const CREATOR_BODY = {
  name: 'Asha Rao',
  city: 'Pune',
  age: 24,
  gender: 'FEMALE',
  adultConfirmed: true,
};
const BRAND_BODY = {
  name: 'Acme Foods',
  city: 'Mumbai',
  website: 'https://acme.example',
  pitch: 'We hire creators for food videos.',
  adultConfirmed: true,
};

describe('PUT /api/me/profile', () => {
  it('saves a creator profile once and locks it', async () => {
    const { user, cookie } = await creator();

    const res = await put(cookie, CREATOR_BODY);

    expect(res.status).toBe(200);
    expect(res.body.profileDetails).toEqual({
      name: 'Asha Rao',
      city: 'Pune',
      age: 24,
      gender: 'FEMALE',
      website: null,
      pitch: null,
      lockedAt: NOW.toISOString(),
      adultConfirmedAt: NOW.toISOString(),
    });
    expect(await row(user.id)).toMatchObject({
      name: 'Asha Rao',
      city: 'Pune',
      age: 24,
      gender: 'FEMALE',
      website: null,
      pitch: null,
      profileLockedAt: NOW,
      adultConfirmedAt: NOW,
      ageRecordedAt: NOW,
    });
  });

  it('saves a brand profile, with and without a pitch', async () => {
    const withPitch = await brand();
    expect((await put(withPitch.cookie, BRAND_BODY)).status).toBe(200);
    expect(await row(withPitch.user.id)).toMatchObject({
      name: 'Acme Foods',
      website: 'https://acme.example',
      pitch: 'We hire creators for food videos.',
      age: null,
      gender: null,
      ageRecordedAt: null,
    });

    const noPitch = await brand();
    const body: Partial<typeof BRAND_BODY> = { ...BRAND_BODY };
    delete body.pitch;
    expect((await put(noPitch.cookie, body)).status).toBe(200);
    expect((await row(noPitch.user.id)).pitch).toBeNull();
  });

  it('takes a brand name with digits, and refuses one for a creator', async () => {
    const studio = await brand();
    expect((await put(studio.cookie, { ...BRAND_BODY, name: 'Studio 9' })).status).toBe(200);
    expect((await row(studio.user.id)).name).toBe('Studio 9');
    const street = await brand();
    expect((await put(street.cookie, { ...BRAND_BODY, name: '21st Street' })).status).toBe(200);

    const { cookie } = await creator();
    const refused = await put(cookie, { ...CREATOR_BODY, name: 'Studio 9' });
    expect(refused.status).toBe(400);
  });

  it('answers 409 PROFILE_LOCKED with the support address on a second save, and changes nothing', async () => {
    const { user, cookie } = await creator();
    await put(cookie, CREATOR_BODY);

    const second = await put(cookie, { ...CREATOR_BODY, name: 'Someone Else', age: 40 });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('PROFILE_LOCKED');
    expect(second.body.error.message).toContain(env.SUPPORT_EMAIL);
    expect(await row(user.id)).toMatchObject({ name: 'Asha Rao', age: 24 });
  });

  it('lets exactly one of two simultaneous saves win', async () => {
    const { user, cookie } = await creator();

    const results = await Promise.all([
      put(cookie, { ...CREATOR_BODY, name: 'First Name' }),
      put(cookie, { ...CREATOR_BODY, name: 'Second Name' }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200)!;
    expect((await row(user.id)).name).toBe(winner.body.profileDetails.name);
  });

  it('takes the fields from the role of the session, never from the body', async () => {
    const asCreator = await creator();
    for (const extra of [{ website: 'https://a.example' }, { pitch: 'x' }, { role: 'BRAND' }]) {
      const res = await put(asCreator.cookie, { ...CREATOR_BODY, ...extra });
      expect(res.status).toBe(400);
    }
    const asBrand = await brand();
    for (const extra of [{ age: 30 }, { gender: 'MALE' }, { role: 'CREATOR' }]) {
      const res = await put(asBrand.cookie, { ...BRAND_BODY, ...extra });
      expect(res.status).toBe(400);
    }
    expect((await row(asCreator.user.id)).profileLockedAt).toBeNull();
    expect((await row(asBrand.user.id)).profileLockedAt).toBeNull();
  });

  describe('age bounds', () => {
    it.each([
      [17, 400],
      [18, 200],
      [99, 200],
      [100, 400],
      [24.5, 400],
      [-3, 400],
    ])('age %s answers %s', async (age, status) => {
      const { user, cookie } = await creator();
      const res = await put(cookie, { ...CREATOR_BODY, age });
      expect(res.status).toBe(status);
      if (status === 400) expect((await row(user.id)).profileLockedAt).toBeNull();
    });

    it('refuses an age as text', async () => {
      const { cookie } = await creator();
      expect((await put(cookie, { ...CREATOR_BODY, age: '24' })).status).toBe(400);
    });
  });

  it('needs the 18 or older tick', async () => {
    const { cookie } = await creator();
    expect((await put(cookie, { ...CREATOR_BODY, adultConfirmed: false })).status).toBe(400);
    const missing: Partial<typeof CREATOR_BODY> = { ...CREATOR_BODY };
    delete missing.adultConfirmed;
    expect((await put(cookie, missing)).status).toBe(400);
  });

  it('refuses a pitch over 1,000 characters and a website that is not http or https', async () => {
    const { cookie } = await brand();
    expect((await put(cookie, { ...BRAND_BODY, pitch: 'a'.repeat(1001) })).status).toBe(400);
    expect((await put(cookie, { ...BRAND_BODY, website: 'javascript:alert(1)' })).status).toBe(400);
    expect((await put(cookie, { ...BRAND_BODY, pitch: 'a'.repeat(1000) })).status).toBe(200);
  });

  it('is refused for an account with no role (email only, no Instagram yet)', async () => {
    const { user, cookie } = await emailUser();
    const res = await put(cookie, CREATOR_BODY);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSTAGRAM_NOT_CONNECTED');
    expect((await row(user.id)).profileLockedAt).toBeNull();
  });

  it('needs a session', async () => {
    expect((await put(undefined, CREATOR_BODY)).status).toBe(401);
  });

  it('needs the Origin header like every mutating request', async () => {
    const { cookie } = await creator();
    const res = await request(app).put('/api/me/profile').set('Cookie', cookie).send(CREATOR_BODY);
    expect(res.status).toBe(403);
  });

  it('is rate limited to 10 saves an hour', async () => {
    const { cookie } = await creator();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      // Invalid bodies still count against the limit.
      statuses.push((await put(cookie, { ...CREATOR_BODY, age: 5 })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('completes onboarding when the profile was the last step, and not before', async () => {
    const unverified = await instagramUser({ role: 'CREATOR', igAccountType: 'MEDIA_CREATOR' });
    expect((await put(unverified.cookie, CREATOR_BODY)).body.onboarding.completed).toBe(false);
    expect((await row(unverified.user.id)).onboardingCompletedAt).toBeNull();

    const ready = await creator();
    const res = await put(ready.cookie, CREATOR_BODY);
    expect(res.body.onboarding.completed).toBe(true);
    expect((await row(ready.user.id)).onboardingCompletedAt).not.toBeNull();
  });

  it('shows up on GET /api/me with the current age, rising on the anniversary', async () => {
    const { cookie } = await creator();
    expect((await getMe(cookie)).profileDetails).toBeNull();

    await put(cookie, CREATOR_BODY);
    expect((await getMe(cookie)).profileDetails).toMatchObject({
      name: 'Asha Rao',
      age: 24,
      adultConfirmedAt: NOW.toISOString(),
    });

    clock = new Date(NOW.getTime() + 366 * 24 * 60 * 60 * 1000);
    expect((await getMe(cookie)).profileDetails.age).toBe(25);
  });

  it('keeps the locked name when Instagram data is refreshed later', async () => {
    const { user, cookie } = await creator();
    await put(cookie, CREATOR_BODY);
    // A later sign-in refreshes the Instagram fields; the name the user gave stays.
    expect((await row(user.id)).name).toBe('Asha Rao');
    expect((await getMe(cookie)).profile.name).toBe('Asha Rao');
  });
});

describe('DB checks on the profile columns', () => {
  it('refuses an age outside 18 to 99, or an age with no recorded date', async () => {
    const { user } = await creator();
    await expect(
      db.update(users).set({ age: 17, ageRecordedAt: NOW }).where(eq(users.id, user.id)),
    ).rejects.toThrow();
    await expect(
      db.update(users).set({ age: 100, ageRecordedAt: NOW }).where(eq(users.id, user.id)),
    ).rejects.toThrow();
    await expect(db.update(users).set({ age: 30 }).where(eq(users.id, user.id))).rejects.toThrow();
    await expect(
      db.update(users).set({ ageRecordedAt: NOW }).where(eq(users.id, user.id)),
    ).rejects.toThrow();
  });

  it('refuses a pitch over 1,000 characters', async () => {
    const { user } = await brand();
    await expect(
      db
        .update(users)
        .set({ pitch: 'a'.repeat(1001) })
        .where(eq(users.id, user.id)),
    ).rejects.toThrow();
  });
});
