import { appConfigResponseSchema } from '@valueskins/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb } from '../db/testDb.js';
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
      minBudgetPaise: 5_000_00,
      advancePercent: 30,
      authEmailEnabled: false,
      razorpayKeyId: env.RAZORPAY_KEY_ID,
      supportEmail: env.SUPPORT_EMAIL,
    });
    expect(res.headers['cache-control']).toBe('public, max-age=60');
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
});
