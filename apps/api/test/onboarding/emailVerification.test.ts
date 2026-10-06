import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { emailLog, emailVerificationTokens, users } from '../../src/db/schema/index.js';
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

const post = (path: string, cookie: string, body: object = {}) =>
  request(app).post(path).set('Origin', origin).set('Cookie', cookie).send(body);

/** The verification token from the latest VERIFY_EMAIL row in email_log. */
async function latestEmailedToken(): Promise<string> {
  const rows = await db.select().from(emailLog).where(eq(emailLog.template, 'VERIFY_EMAIL'));
  const latest = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const token = latest?.bodyText.match(/token=([A-Za-z0-9_-]+)/)?.[1];
  if (!token) throw new Error('no verification token found in email_log');
  return token;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('POST /api/me/email', () => {
  it('stores only the token hash, emails the link, and leaves users.email untouched until verified', async () => {
    const { user, cookie } = await instagramUser({ role: 'CREATOR', roleLockedAt: new Date() });

    const response = await post('/api/me/email', cookie, { email: 'Creator@Example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const token = await latestEmailedToken();
    const [row] = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, user.id));
    expect(row?.email).toBe('creator@example.com');
    expect(row?.tokenHash).toBe(sha256(token));
    expect(row?.tokenHash).not.toBe(token);
    expect(row?.usedAt).toBeNull();
    expect(row!.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 3600 * 1000);
    expect(row!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(24 * 3600 * 1000);

    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after?.email).toBeNull();
    expect(after?.emailVerifiedAt).toBeNull();

    const [logRow] = await db.select().from(emailLog).where(eq(emailLog.template, 'VERIFY_EMAIL'));
    expect(logRow?.toEmail).toBe('creator@example.com');
    expect(logRow?.bodyText).toContain(`${env.WEB_ORIGIN}/verify-email?token=`);
  });

  it('answers the same whether or not another account already uses the address', async () => {
    await emailUser({ email: 'taken@example.com' });
    const a = await instagramUser();
    const b = await instagramUser();

    const taken = await post('/api/me/email', a.cookie, { email: 'taken@example.com' });
    const free = await post('/api/me/email', b.cookie, { email: 'free@example.com' });

    expect(taken.status).toBe(200);
    expect(free.status).toBe(200);
    expect(taken.body).toEqual(free.body);
  });

  it('replaces an earlier unused token, so only the newest link works', async () => {
    const { cookie } = await instagramUser();
    await post('/api/me/email', cookie, { email: 'a@example.com' });
    const first = await latestEmailedToken();
    await post('/api/me/email', cookie, { email: 'a@example.com' });
    const second = await latestEmailedToken();
    expect(second).not.toBe(first);

    expect((await post('/api/me/email/verify', cookie, { token: first })).status).toBe(400);
    expect((await post('/api/me/email/verify', cookie, { token: second })).status).toBe(200);
  });

  it('is blocked for email sign-in accounts (their email is their sign-in)', async () => {
    const { cookie } = await emailUser();
    const response = await post('/api/me/email', cookie, { email: 'new@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_IS_SIGN_IN');
  });

  it('refuses the address that is already the verified one', async () => {
    const { cookie } = await instagramUser({
      email: 'same@example.com',
      emailVerifiedAt: new Date(),
    });
    const response = await post('/api/me/email', cookie, { email: 'SAME@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_UNCHANGED');
  });

  it('rejects an invalid address', async () => {
    const { cookie } = await instagramUser();
    expect((await post('/api/me/email', cookie, { email: 'nope' })).status).toBe(400);
  });

  it('is rate limited to 5 per hour per user (SPEC 13)', async () => {
    const { cookie } = await instagramUser();

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await post('/api/me/email', cookie, { email: `a${i}@example.com` })).status);
    }

    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });
});

describe('POST /api/me/email/verify', () => {
  it('verifies the address, completes onboarding for a creator, and the token works once', async () => {
    const { user, cookie } = await instagramUser({ role: 'CREATOR', roleLockedAt: new Date() });
    await post('/api/me/email', cookie, { email: 'verify@example.com' });
    const token = await latestEmailedToken();

    const response = await post('/api/me/email/verify', cookie, { token });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.completed).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.email).toBe('verify@example.com');
    expect(row?.emailVerifiedAt).not.toBeNull();
    expect(row?.onboardingCompletedAt).not.toBeNull();

    const again = await post('/api/me/email/verify', cookie, { token });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired token', async () => {
    const { cookie } = await instagramUser();
    await post('/api/me/email', cookie, { email: 'late@example.com' });
    const token = await latestEmailedToken();
    await db.update(emailVerificationTokens).set({ expiresAt: new Date(Date.now() - 1000) });

    const response = await post('/api/me/email/verify', cookie, { token });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });

  it("rejects another signed-in user's token with the same error as an unknown one", async () => {
    const owner = await instagramUser();
    const other = await instagramUser();
    await post('/api/me/email', owner.cookie, { email: 'owner@example.com' });
    const token = await latestEmailedToken();

    const stolen = await post('/api/me/email/verify', other.cookie, { token });
    const unknown = await post('/api/me/email/verify', other.cookie, { token: 'x'.repeat(43) });

    expect(stolen.status).toBe(400);
    expect(stolen.body).toEqual(unknown.body);
    // The owner can still use it: the failed attempt did not consume the token.
    expect((await post('/api/me/email/verify', owner.cookie, { token })).status).toBe(200);
  });

  it('answers 409 EMAIL_TAKEN when another account verified the address meanwhile, and does not consume the token', async () => {
    const { cookie } = await instagramUser();
    await post('/api/me/email', cookie, { email: 'race@example.com' });
    const token = await latestEmailedToken();
    await emailUser({ email: 'race@example.com' });

    const response = await post('/api/me/email/verify', cookie, { token });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
    const [row] = await db.select().from(emailVerificationTokens);
    expect(row?.usedAt).toBeNull();
  });

  it('changing the email keeps the old verified address until the new one is verified', async () => {
    const { user, cookie } = await instagramUser({
      email: 'old@example.com',
      emailVerifiedAt: new Date(),
    });

    await post('/api/me/email', cookie, { email: 'new@example.com' });
    const [before] = await db.select().from(users).where(eq(users.id, user.id));
    expect(before?.email).toBe('old@example.com');
    expect(before?.emailVerifiedAt).not.toBeNull();

    await post('/api/me/email/verify', cookie, { token: await latestEmailedToken() });
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after?.email).toBe('new@example.com');
  });

  it('rejects a body with no token', async () => {
    const { cookie } = await instagramUser();
    expect((await post('/api/me/email/verify', cookie, {})).status).toBe(400);
  });
});

describe('POST /api/me/email/resend', () => {
  it('sends a fresh link for the pending address and retires the old one', async () => {
    const { cookie } = await instagramUser();
    await post('/api/me/email', cookie, { email: 'pending@example.com' });
    const first = await latestEmailedToken();

    const response = await post('/api/me/email/resend', cookie);

    expect(response.status).toBe(200);
    const second = await latestEmailedToken();
    expect(second).not.toBe(first);
    const logs = await db.select().from(emailLog).where(eq(emailLog.template, 'VERIFY_EMAIL'));
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.toEmail === 'pending@example.com')).toBe(true);
    expect((await post('/api/me/email/verify', cookie, { token: first })).status).toBe(400);
    expect((await post('/api/me/email/verify', cookie, { token: second })).status).toBe(200);
  });

  it('works after the first link expired', async () => {
    const { cookie } = await instagramUser();
    await post('/api/me/email', cookie, { email: 'expired@example.com' });
    await db.update(emailVerificationTokens).set({ expiresAt: new Date(Date.now() - 1000) });

    expect((await post('/api/me/email/resend', cookie)).status).toBe(200);
    expect(
      (await post('/api/me/email/verify', cookie, { token: await latestEmailedToken() })).status,
    ).toBe(200);
  });

  it('answers 409 NO_PENDING_EMAIL when nothing is waiting to be verified', async () => {
    const { cookie } = await instagramUser();
    const response = await post('/api/me/email/resend', cookie);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('NO_PENDING_EMAIL');
  });

  it('is rate limited together with /api/me/email (5 per hour per user)', async () => {
    const { cookie } = await instagramUser();
    await post('/api/me/email', cookie, { email: 'a@example.com' });

    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await post('/api/me/email/resend', cookie)).status);

    expect(statuses).toEqual([200, 200, 200, 200, 429]);
  });
});
