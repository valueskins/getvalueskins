import { desc, eq } from 'drizzle-orm';
import type { Express } from 'express';
import { http as mswHttp, HttpResponse } from 'msw';
import request from 'supertest';
import { expect } from 'vitest';
import { db } from '../../src/db/client.js';
import { emailLog } from '../../src/db/schema/index.js';
import { createApp } from '../../src/app.js';
import { NOW, READY_DRAFT, http } from '../helpers/deals.js';
import { deliverWebhook, paymentCapturedEvent } from '../helpers/payments.js';
import { razorpayCaptured } from '../payments/fixture.js';
import { buildTestEnv } from '../testEnv.js';

/**
 * Shared setup for the end-to-end tests: the app as it runs on staging (GST charged, a company
 * GSTIN, an admin by Instagram id), Instagram answering for three people, and helpers that drive
 * sign-in and onboarding through the real endpoints. Nothing here writes to the database directly.
 */

export const PERSONAS = {
  brand: {
    key: 'brand',
    id: 'ig-e2e-brand',
    username: 'e2e_brand',
    type: 'BUSINESS',
    email: 'brand-e2e@example.com',
  },
  creator: {
    key: 'creator',
    id: 'ig-e2e-creator',
    username: 'e2e_creator',
    type: 'MEDIA_CREATOR',
    email: 'creator-e2e@example.com',
  },
  admin: {
    key: 'admin',
    id: 'ig-e2e-admin',
    username: 'e2e_admin',
    type: 'BUSINESS',
    email: 'admin-e2e@example.com',
  },
  stranger: {
    key: 'stranger',
    id: 'ig-e2e-stranger',
    username: 'e2e_stranger',
    type: 'BUSINESS',
    email: 'stranger-e2e@example.com',
  },
} as const;

export type Persona = (typeof PERSONAS)[keyof typeof PERSONAS];
const byKey = new Map<string, Persona>(Object.values(PERSONAS).map((p) => [p.key, p]));

/** The creator's UPI ID. It must never appear anywhere except the brand's pay response. */
export const CREATOR_VPA = 'e2e.creator@okaxis';

export function e2eEnv(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  return buildTestEnv({
    GST_RATE_BPS: '1800',
    COMPANY_GSTIN: '29ABCDE1234F1Z5',
    ADMIN_INSTAGRAM_USER_IDS: PERSONAS.admin.id,
    ...overrides,
  });
}

export function e2eApp(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  const env = e2eEnv(overrides);
  const app = createApp(env, {
    now: () => NOW,
    razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} },
  });
  return { env, app, call: http(app) };
}

/** Instagram's side of the sign-in: the authorization code is the persona key. */
export function instagramHandlers() {
  const personaOf = (token: string | null): Persona => {
    const key = (token ?? '').replace(/^(short|long)-/, '');
    const persona = byKey.get(key);
    if (!persona) throw new Error(`unknown Instagram token ${token}`);
    return persona;
  };
  return [
    mswHttp.post('https://api.instagram.com/oauth/access_token', async ({ request: req }) => {
      const form = await req.formData();
      const persona = personaOf(`short-${String(form.get('code'))}`);
      return HttpResponse.json({ access_token: `short-${persona.key}`, user_id: persona.id });
    }),
    mswHttp.get('https://graph.instagram.com/access_token', ({ request: req }) => {
      const persona = personaOf(new URL(req.url).searchParams.get('access_token'));
      return HttpResponse.json({ access_token: `long-${persona.key}`, expires_in: 5_184_000 });
    }),
    mswHttp.get('https://graph.instagram.com/me', ({ request: req }) => {
      const persona = personaOf(new URL(req.url).searchParams.get('access_token'));
      return HttpResponse.json({
        user_id: persona.id,
        username: persona.username,
        name: persona.username,
        account_type: persona.type,
        profile_picture_url: 'https://example.com/pic.jpg',
        followers_count: 12_000,
        follows_count: 300,
        media_count: 80,
        biography: 'E2E account',
      });
    }),
    mswHttp.get('https://graph.instagram.com/me/media', () => HttpResponse.json({ data: [] })),
  ];
}

const cookiePairs = (res: request.Response) =>
  ((res.headers['set-cookie'] ?? []) as unknown as string[]).map((c) => c.split(';')[0] as string);

/** Signs in through the real start and callback endpoints and returns the session cookie. */
export async function signInWithInstagram(
  app: Express,
  env: { SESSION_COOKIE_NAME: string },
  who: Persona,
) {
  const start = await request(app).get('/api/auth/instagram/start');
  expect(start.status).toBe(302);
  const state = new URL(start.headers.location as string).searchParams.get('state')!;
  const callback = await request(app)
    .get(`/api/auth/instagram/callback?code=${who.key}&state=${state}`)
    .set('Cookie', cookiePairs(start).join('; '));
  expect(callback.status).toBe(302);
  const session = cookiePairs(callback).find((c) => c.startsWith(`${env.SESSION_COOKIE_NAME}=`));
  expect(session, 'a session cookie after sign-in').toBeTruthy();
  return { cookie: session as string, location: callback.headers.location as string };
}

type Call = ReturnType<typeof http>;
type PutCall = (path: string, cookie: string, body: object) => request.Test;

/** PUT is not in the shared helper; this sets the same Origin header. */
export function putter(app: Express, origin: string): PutCall {
  return (path, cookie, body) =>
    request(app).put(path).set('Origin', origin).set('Cookie', cookie).send(body);
}

/** The newest email_log row for a template (and, optionally, an address). */
export async function latestEmail(template: string, toEmail?: string) {
  const rows = await db
    .select()
    .from(emailLog)
    .orderBy(desc(emailLog.createdAt), desc(emailLog.id));
  return rows.find((r) => r.template === template && (!toEmail || r.toEmail === toEmail));
}

/** Adds and verifies an email address through the real endpoints (the link comes from email_log). */
export async function verifyEmail(call: Call, cookie: string, email: string) {
  const added = await call.send('post', '/api/me/email', cookie, { email });
  expect(added.status, JSON.stringify(added.body)).toBe(200);
  const mail = await latestEmail('VERIFY_EMAIL', email);
  const token = /token=([A-Za-z0-9_-]+)/.exec(mail?.bodyText ?? '')?.[1];
  expect(token, 'a verification link in the email').toBeTruthy();
  const verified = await call.send('post', '/api/me/email/verify', cookie, { token });
  expect(verified.status, JSON.stringify(verified.body)).toBe(200);
}

export interface Onboarded {
  cookie: string;
  userId: string;
}

/** A brand through sign-in, email, profile and billing, using only the public endpoints. */
export async function onboardBrand(
  ctx: { app: Express; env: { SESSION_COOKIE_NAME: string; WEB_ORIGIN: string }; call: Call },
  who: Persona = PERSONAS.brand,
): Promise<Onboarded> {
  const { cookie } = await signInWithInstagram(ctx.app, ctx.env, who);
  await verifyEmail(ctx.call, cookie, who.email);
  const put = putter(ctx.app, ctx.env.WEB_ORIGIN);
  const profile = await put('/api/me/profile', cookie, {
    name: 'Brand Owner',
    city: 'Bengaluru',
    website: 'https://brand.example',
    pitch: 'We make things.',
    adultConfirmed: true,
  });
  expect(profile.status, JSON.stringify(profile.body)).toBe(200);
  const billing = await put('/api/me/billing', cookie, {
    billingName: 'Brand Private Limited',
    billingAddress: '1 Main Road, Bengaluru',
    billingState: 'Karnataka',
    gstin: '29AAAAA0000A1Z5',
  });
  expect(billing.status, JSON.stringify(billing.body)).toBe(200);
  const me = await ctx.call.get('/api/me', cookie);
  expect(me.body.onboarding.completed).toBe(true);
  return { cookie, userId: me.body.user.id as string };
}

/** A creator through sign-in, email, profile and the UPI payout details. */
export async function onboardCreator(
  ctx: { app: Express; env: { SESSION_COOKIE_NAME: string; WEB_ORIGIN: string }; call: Call },
  who: Persona = PERSONAS.creator,
): Promise<Onboarded> {
  const { cookie } = await signInWithInstagram(ctx.app, ctx.env, who);
  await verifyEmail(ctx.call, cookie, who.email);
  const put = putter(ctx.app, ctx.env.WEB_ORIGIN);
  const profile = await put('/api/me/profile', cookie, {
    name: 'Creator Person',
    city: 'Pune',
    age: 27,
    gender: 'FEMALE',
    adultConfirmed: true,
  });
  expect(profile.status, JSON.stringify(profile.body)).toBe(200);
  const upi = await put('/api/me/payout-upi', cookie, {
    vpa: CREATOR_VPA,
    name: 'Creator Person',
    consent: true,
  });
  expect(upi.status, JSON.stringify(upi.body)).toBe(200);
  const me = await ctx.call.get('/api/me', cookie);
  expect(me.body.onboarding.completed).toBe(true);
  return { cookie, userId: me.body.user.id as string };
}

export const isPdf = (body: unknown) =>
  Buffer.isBuffer(body) && body.subarray(0, 5).toString() === '%PDF-';

export async function emailsOfDeal(dealId: string) {
  return db
    .select()
    .from(emailLog)
    .where(eq(emailLog.dealId, dealId))
    .orderBy(emailLog.createdAt, emailLog.id);
}

export interface Actors {
  brand: Onboarded;
  creator: Onboarded;
  admin: { cookie: string };
}

type Ctx = Parameters<typeof onboardBrand>[0];

/** A brand and a creator that finished onboarding, and an admin, all by signing in with Instagram. */
export async function signInActors(ctx: Ctx): Promise<Actors> {
  const brand = await onboardBrand(ctx);
  const creator = await onboardCreator(ctx);
  const admin = await signInWithInstagram(ctx.app, ctx.env, PERSONAS.admin);
  return { brand, creator, admin: { cookie: admin.cookie } };
}

/** The brand posts and publishes a deal, the creator applies and the brand confirms: CONFIRMED. */
export async function confirmedDeal(call: Call, actors: Actors) {
  const draft = await call.send('post', '/api/deals', actors.brand.cookie, READY_DRAFT);
  expect(draft.status, JSON.stringify(draft.body)).toBe(201);
  const dealId = draft.body.deal.id as string;
  const published = await call.send(
    'post',
    `/api/deals/${dealId}/publish`,
    actors.brand.cookie,
    {},
  );
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  const applied = await call.send(
    'post',
    `/api/deals/${dealId}/applications`,
    actors.creator.cookie,
    {},
  );
  expect(applied.status, JSON.stringify(applied.body)).toBe(201);
  const confirmed = await call.send(
    'post',
    `/api/applications/${applied.body.application.id}/confirm`,
    actors.brand.cookie,
    {},
  );
  expect(confirmed.body.deal.status).toBe('CONFIRMED');
  return { dealId, shortId: draft.body.deal.shortId as string };
}

/** The brand opens Checkout: a Razorpay order for the fee, with the amount the API froze. */
export async function openCheckout(call: Call, brand: Onboarded, dealId: string) {
  const order = await call.send(
    'post',
    `/api/deals/${dealId}/payments/commission/order`,
    brand.cookie,
    {},
  );
  expect(order.status, JSON.stringify(order.body)).toBe(200);
  return { orderId: order.body.orderId as string, amountPaise: order.body.amountPaise as number };
}

/** The fee is paid through Razorpay and reaches the API as a signed webhook. */
export async function payFeeByWebhook(
  app: Express,
  razorpay: Parameters<typeof razorpayCaptured>[0],
  checkout: { orderId: string; amountPaise: number },
  paymentId = 'pay_e2e_fee',
) {
  razorpayCaptured(
    razorpay,
    { orderId: checkout.orderId, amount: checkout.amountPaise },
    'commission',
    { paymentId },
  );
  const delivered = await deliverWebhook(
    app,
    paymentCapturedEvent(checkout.orderId, paymentId, checkout.amountPaise),
  );
  expect(delivered.response.status).toBe(200);
  return paymentId;
}

let feeCounter = 0;

/** Deal at COMMISSION_PAID: confirmed, then the fee paid by signed webhook. */
export async function feePaidDeal(
  ctx: Ctx,
  actors: Actors,
  razorpay: Parameters<typeof razorpayCaptured>[0],
) {
  const deal = await confirmedDeal(ctx.call, actors);
  const checkout = await openCheckout(ctx.call, actors.brand, deal.dealId);
  feeCounter += 1;
  const paymentId = await payFeeByWebhook(ctx.app, razorpay, checkout, `pay_e2e_fee_${feeCounter}`);
  return { ...deal, checkout, paymentId };
}
