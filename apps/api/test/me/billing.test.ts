import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { emailUser, instagramUser } from '../helpers/auth.js';
import { brandWithBilling, creatorWithPayout } from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();
const app = createApp(env);

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

const get = (cookie?: string) => {
  const req = request(app).get('/api/me/billing');
  return cookie ? req.set('Cookie', cookie) : req;
};
const put = (cookie: string, body: object) =>
  request(app)
    .put('/api/me/billing')
    .set('Origin', env.WEB_ORIGIN)
    .set('Cookie', cookie)
    .send(body);

describe('GET /api/me/billing', () => {
  it('answers null for a brand that has saved nothing yet', async () => {
    const { cookie } = await instagramUser({ role: 'BRAND' });
    const res = await get(cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ billing: null });
  });

  it('gives back the saved details, with a null GSTIN when there is none', async () => {
    const brand = await brandWithBilling();
    expect((await get(brand.cookie)).body).toEqual({
      billing: {
        billingName: 'Brand Pvt Ltd',
        billingAddress: '1 Main Road',
        billingState: 'Karnataka',
        gstin: null,
      },
    });

    const second = await instagramUser({ role: 'BRAND' });
    await put(second.cookie, {
      billingName: 'Acme Pvt Ltd',
      billingAddress: '12 MG Road',
      billingState: 'Goa',
      gstin: '29ABCDE1234F1Z5',
    });
    expect((await get(second.cookie)).body.billing).toMatchObject({
      billingName: 'Acme Pvt Ltd',
      gstin: '29ABCDE1234F1Z5',
    });
  });

  it('PUT answers with the saved details too', async () => {
    const { cookie } = await instagramUser({ role: 'BRAND' });
    const res = await put(cookie, {
      billingName: 'Acme',
      billingAddress: '1 Road',
      billingState: 'Goa',
    });
    expect(res.status).toBe(200);
    expect(res.body.billing).toEqual({
      billingName: 'Acme',
      billingAddress: '1 Road',
      billingState: 'Goa',
      gstin: null,
    });
    expect(res.body.onboarding).toBeDefined();
  });

  it('is only for the brand itself: 401 signed out, 403 for a creator and for an account with no role', async () => {
    expect((await get()).status).toBe(401);
    const creator = await creatorWithPayout();
    const roleless = await emailUser();
    const asCreator = await get(creator.cookie);
    expect(asCreator.status).toBe(403);
    expect(asCreator.body.error.code).toBe('WRONG_ROLE');
    const asNoRole = await get(roleless.cookie);
    expect(asNoRole.status).toBe(403);
    expect(asNoRole.body.error.code).toBe('INSTAGRAM_NOT_CONNECTED');
  });

  it("never shows one brand another brand's details", async () => {
    const a = await brandWithBilling();
    const b = await instagramUser({ role: 'BRAND' });
    await put(a.cookie, {
      billingName: 'A Secret Name',
      billingAddress: '1 Road',
      billingState: 'Goa',
    });
    expect(JSON.stringify((await get(b.cookie)).body)).not.toContain('A Secret Name');
    expect((await get(b.cookie)).body.billing).toBeNull();
  });
});
