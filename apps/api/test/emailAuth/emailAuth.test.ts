import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { emailLog, emailLoginCodes, users } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { buildTestEnv } from '../testEnv.js';

beforeAll(async () => {
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await closeDb();
});

describe('email-code login', () => {
  it('routes are absent (404) when AUTH_EMAIL_ENABLED is false', async () => {
    const app = createApp(buildTestEnv({ AUTH_EMAIL_ENABLED: 'false' }));

    const response = await request(app)
      .post('/api/auth/email/start')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'a@example.com' });

    expect(response.status).toBe(404);
  });

  it('start responds identically for an existing vs a non-existent email', async () => {
    const env = buildTestEnv({ AUTH_EMAIL_ENABLED: 'true' });
    const app = createApp(env);

    await db
      .insert(users)
      .values({ username: 'existing', name: 'Existing', email: 'existing@example.com' });

    const forExisting = await request(app)
      .post('/api/auth/email/start')
      .set('Origin', env.WEB_ORIGIN)
      .send({ email: 'existing@example.com' });
    const forNew = await request(app)
      .post('/api/auth/email/start')
      .set('Origin', env.WEB_ORIGIN)
      .send({ email: 'brandnew@example.com' });

    expect(forExisting.status).toBe(200);
    expect(forNew.status).toBe(200);
    expect(forExisting.body).toEqual(forNew.body);
  });

  it('start writes an email_login_codes row and a SIGN_IN_CODE email_log row', async () => {
    const env = buildTestEnv({ AUTH_EMAIL_ENABLED: 'true', EMAIL_TRANSPORT: 'console' });
    const app = createApp(env);

    await request(app)
      .post('/api/auth/email/start')
      .set('Origin', env.WEB_ORIGIN)
      .send({ email: 'new@example.com' });

    const codes = await db
      .select()
      .from(emailLoginCodes)
      .where(eq(emailLoginCodes.email, 'new@example.com'));
    expect(codes).toHaveLength(1);
    expect(codes[0]?.attempts).toBe(0);

    const logs = await db.select().from(emailLog).where(eq(emailLog.toEmail, 'new@example.com'));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.template).toBe('SIGN_IN_CODE');
    expect(logs[0]?.status).toBe('SENT');
  });

  it('verify creates a new user on first use and logs into the same user on repeat', async () => {
    const env = buildTestEnv({ AUTH_EMAIL_ENABLED: 'true', EMAIL_TRANSPORT: 'console' });
    const app = createApp(env);

    const code = await requestAndReadCode(app, env, 'repeat@example.com');
    const first = await request(app)
      .post('/api/auth/email/verify')
      .set('Origin', env.WEB_ORIGIN)
      .send({ email: 'repeat@example.com', code });
    expect(first.status).toBe(200);
    expect(first.body.user.email).toBe('repeat@example.com');
    expect(first.body.user.instagramUserId).toBeNull();
    const firstUserId = first.body.user.id;

    const secondCode = await requestAndReadCode(app, env, 'repeat@example.com');
    const second = await request(app)
      .post('/api/auth/email/verify')
      .set('Origin', env.WEB_ORIGIN)
      .send({ email: 'repeat@example.com', code: secondCode });
    expect(second.body.user.id).toBe(firstUserId);

    const allUsers = await db.select().from(users).where(eq(users.email, 'repeat@example.com'));
    expect(allUsers).toHaveLength(1);
  });

  it('rejects an expired code', async () => {
    const env = buildTestEnv({ AUTH_EMAIL_ENABLED: 'true', EMAIL_TRANSPORT: 'console' });
    const app = createApp(env);

    const code = await requestAndReadCode(app, env, 'expired@example.com');
    await db
      .update(emailLoginCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(emailLoginCodes.email, 'expired@example.com'));

    const response = await request(app)
      .post('/api/auth/email/verify')
      .set('Origin', env.WEB_ORIGIN)
      .send({ email: 'expired@example.com', code });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CODE');
  });

  it('kills the code after 5 wrong attempts', async () => {
    const env = buildTestEnv({ AUTH_EMAIL_ENABLED: 'true', EMAIL_TRANSPORT: 'console' });
    const app = createApp(env);

    const code = await requestAndReadCode(app, env, 'attempts@example.com');

    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post('/api/auth/email/verify')
        .set('Origin', env.WEB_ORIGIN)
        .send({ email: 'attempts@example.com', code: '000000' });
      expect(response.status).toBe(400);
    }

    // Even the correct code no longer works once attempts are exhausted.
    const finalResponse = await request(app)
      .post('/api/auth/email/verify')
      .set('Origin', env.WEB_ORIGIN)
      .send({ email: 'attempts@example.com', code });
    expect(finalResponse.status).toBe(400);
    expect(finalResponse.body.error.code).toBe('INVALID_CODE');
  });

  it('a code can only be used once', async () => {
    const env = buildTestEnv({ AUTH_EMAIL_ENABLED: 'true', EMAIL_TRANSPORT: 'console' });
    const app = createApp(env);

    const code = await requestAndReadCode(app, env, 'singleuse@example.com');
    const first = await request(app)
      .post('/api/auth/email/verify')
      .set('Origin', env.WEB_ORIGIN)
      .send({ email: 'singleuse@example.com', code });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/auth/email/verify')
      .set('Origin', env.WEB_ORIGIN)
      .send({ email: 'singleuse@example.com', code });
    expect(second.status).toBe(400);
  });

  it('rate limits /start past loginIpLimiter (SPEC 13: 20/hour/IP)', async () => {
    const env = buildTestEnv({ AUTH_EMAIL_ENABLED: 'true', EMAIL_TRANSPORT: 'console' });
    const app = createApp(env);

    let last;
    for (let i = 0; i < 21; i++) {
      last = await request(app)
        .post('/api/auth/email/start')
        .set('Origin', env.WEB_ORIGIN)
        .send({ email: `flood${i}@example.com` });
    }

    expect(last?.status).toBe(429);
    expect(last?.headers['retry-after']).toBeDefined();
  });
});

/** Requests a code via the real HTTP route, then reads the raw code back out
 * of the console-transport-logged email_log row (the code itself is never
 * exposed in the /start response, matching the non-enumeration contract). */
async function requestAndReadCode(
  app: ReturnType<typeof import('../../src/app.js').createApp>,
  env: ReturnType<typeof import('../testEnv.js').buildTestEnv>,
  email: string,
): Promise<string> {
  await request(app).post('/api/auth/email/start').set('Origin', env.WEB_ORIGIN).send({ email });

  const logs = await db.select().from(emailLog).where(eq(emailLog.toEmail, email.toLowerCase()));
  const latest = logs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const match = latest?.bodyText.match(/(\d{6})/);
  if (!match) throw new Error('could not read sign-in code from email_log');
  return match[1]!;
}
