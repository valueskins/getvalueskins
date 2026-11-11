import { appConfigResponseSchema } from '@valueskins/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
import { buildTestEnv } from '../testEnv.js';

beforeAll(resetDb);
afterAll(closeDb);

describe('GET /api/config', () => {
  it('is public and returns what the web app needs', async () => {
    const env = buildTestEnv();
    const res = await request(createApp(env)).get('/api/config');
    expect(res.status).toBe(200);
    expect(appConfigResponseSchema.parse(res.body)).toEqual({
      gstRateBps: 0,
      minBudgetPaise: 2000_00,
      advancePercent: 30,
      authEmailEnabled: false,
      razorpayKeyId: env.RAZORPAY_KEY_ID,
      supportEmail: env.SUPPORT_EMAIL,
      paymentsOpen: true,
      postingOpen: true,
    });
  });

  it('is private to the caller, never shared-cached', async () => {
    const res = await request(createApp(buildTestEnv())).get('/api/config');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers.vary).toMatch(/Cookie/i);
  });

  it('reflects the live GST rate and the email sign-in flag', async () => {
    const env = buildTestEnv({
      GST_RATE_BPS: '1800',
      COMPANY_GSTIN: '29ABCDE1234F1Z5',
      AUTH_EMAIL_ENABLED: 'true',
    });
    const res = await request(createApp(env)).get('/api/config');
    expect(res.body).toMatchObject({ gstRateBps: 1800, authEmailEnabled: true });
  });

  it('never exposes the Razorpay secrets', async () => {
    const env = buildTestEnv();
    const res = await request(createApp(env)).get('/api/config');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(env.RAZORPAY_KEY_SECRET);
    expect(body).not.toContain(env.RAZORPAY_WEBHOOK_SECRET);
  });

  describe('launch flags (SPEC 19)', () => {
    const cases = [
      { mode: 'off', anonymous: false, user: false, admin: false },
      { mode: 'admins', anonymous: false, user: false, admin: true },
      { mode: 'on', anonymous: true, user: true, admin: true },
    ] as const;

    it.each(cases)(
      'PAYMENTS_MODE=$mode: anonymous $anonymous, user $user, admin $admin',
      async ({ mode, anonymous, user, admin }) => {
        const env = buildTestEnv({ PAYMENTS_MODE: mode, DEAL_POSTING_MODE: 'on' });
        const app = createApp(env);
        const ordinary = await createUserWithSession();
        const administrator = await createUserWithSession({ isAdmin: true });

        const anon = await request(app).get('/api/config');
        const asUser = await request(app).get('/api/config').set('Cookie', ordinary.cookie);
        const asAdmin = await request(app).get('/api/config').set('Cookie', administrator.cookie);
        expect(anon.body.paymentsOpen).toBe(anonymous);
        expect(asUser.body.paymentsOpen).toBe(user);
        expect(asAdmin.body.paymentsOpen).toBe(admin);
        // The other gate is independent.
        expect(anon.body.postingOpen).toBe(true);
      },
    );

    it.each(cases)(
      'DEAL_POSTING_MODE=$mode: anonymous $anonymous, user $user, admin $admin',
      async ({ mode, anonymous, user, admin }) => {
        const env = buildTestEnv({ PAYMENTS_MODE: 'on', DEAL_POSTING_MODE: mode });
        const app = createApp(env);
        const ordinary = await createUserWithSession();
        const administrator = await createUserWithSession({ isAdmin: true });

        const anon = await request(app).get('/api/config');
        const asUser = await request(app).get('/api/config').set('Cookie', ordinary.cookie);
        const asAdmin = await request(app).get('/api/config').set('Cookie', administrator.cookie);
        expect(anon.body.postingOpen).toBe(anonymous);
        expect(asUser.body.postingOpen).toBe(user);
        expect(asAdmin.body.postingOpen).toBe(admin);
        expect(anon.body.paymentsOpen).toBe(true);
      },
    );

    it('production defaults to both closed, even for an admin', async () => {
      const env = buildTestEnv({
        NODE_ENV: 'production',
        ENABLE_DEV_LOGIN: 'false',
        EMAIL_TRANSPORT: 'resend',
        RAZORPAY_KEY_ID: '',
        RAZORPAY_KEY_SECRET: '',
        RAZORPAY_WEBHOOK_SECRET: '',
      });
      const administrator = await createUserWithSession({ isAdmin: true });
      const res = await request(createApp(env))
        .get('/api/config')
        .set('Cookie', administrator.cookie);
      expect(res.body).toMatchObject({ paymentsOpen: false, postingOpen: false });
    });
  });
});
