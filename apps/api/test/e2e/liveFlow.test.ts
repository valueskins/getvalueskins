import { computeBreakdown, dealRoom } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import {
  dealEvents,
  deals,
  emailLog,
  invoices,
  payments,
  webhookEvents,
} from '../../src/db/schema/index.js';
import { setRealtime } from '../../src/realtime/emitter.js';
import { closeDb, resetDb } from '../db/testDb.js';
import { READY_DRAFT } from '../helpers/deals.js';
import { DRIVE_LINK } from '../helpers/lifecycle.js';
import {
  deliverWebhook,
  orderPaidEvent,
  paymentCapturedEvent,
  verifyBody,
} from '../helpers/payments.js';
import { confirmPayment, razorpayCaptured, recordPayment } from '../payments/fixture.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';
import {
  CREATOR_VPA,
  PERSONAS,
  e2eApp,
  emailsOfDeal,
  instagramHandlers,
  isPdf,
  onboardBrand,
  onboardCreator,
  signInWithInstagram,
  type Onboarded,
} from './harness.js';

/**
 * The whole live flow through the public endpoints only (Prompt 17): Instagram sign-in for a
 * Business and a Creator account, onboarding, a deal, the fee through Razorpay with signed
 * webhooks, the advance and the final paid directly by UPI, content with a revision, approval,
 * COMPLETED, every document and every email. Steps run in order and share state.
 */

const { env, app, call } = e2eApp();
const msw = setupServer(...instagramHandlers());
const razorpay: OrdersMockState = newOrdersState();
const emitted: Array<{ room: string; event: string; payload: { id?: string; status?: string } }> =
  [];

let brand: Onboarded;
let creator: Onboarded;
let admin: { cookie: string };
let stranger: Onboarded;
let dealId: string;
let shortId: string;
let applicationId: string;
const expected = computeBreakdown(10_000_00, 1800);

beforeAll(async () => {
  msw.listen({ onUnhandledRequest: 'bypass' });
  msw.use(...ordersHandlers(razorpay));
  await resetDb();
  setRealtime({
    emit: (room, event, payload) => void emitted.push({ room, event, payload: payload as never }),
  });
});
afterEach(() => undefined);
afterAll(async () => {
  setRealtime(null);
  msw.close();
  await closeDb();
});

const statusOf = async () =>
  (await call.get(`/api/deals/${dealId}`, brand.cookie)).body.deal.status;
const sentTo = async (template: string) =>
  (await emailsOfDeal(dealId)).filter((e) => e.template === template);

describe('the whole live flow', () => {
  it('1. a Business account signs in as a brand, a Creator account as a creator, and nobody picks a role', async () => {
    const brandSignIn = await signInWithInstagram(app, env, PERSONAS.brand);
    const creatorSignIn = await signInWithInstagram(app, env, PERSONAS.creator);
    expect(brandSignIn.location).toBe(`${env.WEB_ORIGIN}/onboarding`);
    expect(creatorSignIn.location).toBe(`${env.WEB_ORIGIN}/onboarding`);

    const brandMe = await call.get('/api/me', brandSignIn.cookie);
    const creatorMe = await call.get('/api/me', creatorSignIn.cookie);
    expect(brandMe.body.user).toMatchObject({ role: 'BRAND', isAdmin: false });
    expect(creatorMe.body.user).toMatchObject({ role: 'CREATOR', isAdmin: false });
    expect(brandMe.body.profile.accountType).toBe('BUSINESS');
    expect(creatorMe.body.profile.accountType).toBe('MEDIA_CREATOR');
    expect(brandMe.body.onboarding.completed).toBe(false);

    // Until onboarding is done the marketplace is closed.
    const early = await call.get('/api/deals/feed', creatorSignIn.cookie);
    expect(early.status).toBe(403);
    expect(early.body.error.code).toBe('ONBOARDING_INCOMPLETE');

    // The admin is a Business account whose Instagram id is in ADMIN_INSTAGRAM_USER_IDS.
    admin = await signInWithInstagram(app, env, PERSONAS.admin);
    expect((await call.get('/api/me', admin.cookie)).body.user.isAdmin).toBe(true);
    expect((await call.get('/api/admin/deals', admin.cookie)).status).toBe(200);
    expect((await call.get('/api/admin/deals', brandSignIn.cookie)).status).toBe(404);
  });

  it('2. onboarding through the API: email, profile, billing for the brand, UPI for the creator', async () => {
    brand = await onboardBrand({ app, env, call });
    creator = await onboardCreator({ app, env, call });
    stranger = await onboardBrand({ app, env, call }, PERSONAS.stranger);

    const billing = await call.get('/api/me/billing', brand.cookie);
    expect(billing.body.billing).toMatchObject({
      billingName: 'Brand Private Limited',
      billingState: 'Karnataka',
    });
    expect((await call.get('/api/me/billing', creator.cookie)).status).toBe(403);

    // The creator sees their UPI ID only masked.
    const upi = await call.get('/api/me/payout-upi', creator.cookie);
    expect(upi.body.payoutUpi.maskedVpa).toMatch(/^e2•••@okaxis$/);
    expect(JSON.stringify(upi.body)).not.toContain(CREATOR_VPA);
    expect((await call.get('/api/me', creator.cookie)).body.onboarding.completed).toBe(true);
  });

  it('3. the brand posts a deal; the fee is frozen with 18% GST and the creators feed shows it', async () => {
    const draft = await call.send('post', '/api/deals', brand.cookie, READY_DRAFT);
    expect(draft.status).toBe(201);
    dealId = draft.body.deal.id;
    shortId = draft.body.deal.shortId;
    expect(draft.body.deal.status).toBe('DRAFT');

    const published = await call.send('post', `/api/deals/${dealId}/publish`, brand.cookie, {});
    expect(published.status).toBe(200);
    expect(published.body.deal).toMatchObject({
      status: 'OPEN',
      commissionBasePaise: expected.commissionBasePaise,
      commissionGstPaise: expected.commissionGstPaise,
      commissionTotalPaise: 88_500,
      creatorAmountPaise: expected.creatorAmountPaise,
      advancePaise: expected.advancePaise,
      finalPaise: expected.finalPaise,
    });
    expect(expected.commissionTotalPaise + expected.creatorAmountPaise).toBeGreaterThan(0);
    expect(expected.commissionBasePaise + expected.advancePaise + expected.finalPaise).toBe(
      expected.budgetPaise - expected.commissionGstPaise,
    );
    expect(await sentTo('DEAL_PUBLISHED')).toHaveLength(1);

    const feed = await call.get('/api/deals/feed', creator.cookie);
    const item = feed.body.items.find((d: { id: string }) => d.id === dealId);
    expect(item).toMatchObject({
      advancePaise: expected.advancePaise,
      finalPaise: expected.finalPaise,
      applied: false,
    });
    // The other brand cannot post into, or edit, this deal.
    expect(
      (await call.send('post', `/api/deals/${dealId}/cancel`, stranger.cookie, { reason: 'x' }))
        .status,
    ).toBe(404);
  });

  it('4. the creator applies, the brand confirms, and each side is told whose turn it is', async () => {
    const applied = await call.send(
      'post',
      `/api/deals/${dealId}/applications`,
      creator.cookie,
      {},
    );
    expect(applied.status).toBe(201);
    applicationId = applied.body.application.id;
    expect(await sentTo('NEW_APPLICATION')).toHaveLength(1);

    const feed = await call.get('/api/deals/feed', creator.cookie);
    expect(feed.body.items.find((d: { id: string }) => d.id === dealId).applied).toBe(true);

    const applicants = await call.get(`/api/deals/${dealId}/applications`, brand.cookie);
    expect(applicants.body.items[0]).toMatchObject({ confirm: { enabled: true, reason: null } });
    const mineBefore = await call.get('/api/deals/mine', brand.cookie);
    expect(mineBefore.body.items[0]).toMatchObject({
      yourTurn: true,
      nextStep: 'CONFIRM_CREATOR',
      applicantCount: 1,
    });

    const confirmed = await call.send(
      'post',
      `/api/applications/${applicationId}/confirm`,
      brand.cookie,
      {},
    );
    expect(confirmed.body.deal.status).toBe('CONFIRMED');
    expect(await sentTo('YOU_WERE_SELECTED')).toHaveLength(1);

    expect((await call.get('/api/deals/mine', brand.cookie)).body.items[0]).toMatchObject({
      yourTurn: true,
      nextStep: 'PAY_FEE',
    });
    expect((await call.get('/api/deals/mine', creator.cookie)).body.items[0]).toMatchObject({
      yourTurn: false,
      nextStep: 'PAY_FEE',
    });
  });

  it('5. the fee goes through Razorpay: signed webhooks and verify together move the deal once', async () => {
    const order = await call.send(
      'post',
      `/api/deals/${dealId}/payments/commission/order`,
      brand.cookie,
      {},
    );
    expect(order.status).toBe(200);
    expect(order.body.amountPaise).toBe(88_500);
    const paymentId = razorpayCaptured(
      razorpay,
      { orderId: order.body.orderId, amount: order.body.amountPaise },
      'commission',
      { paymentId: 'pay_e2e_fee' },
    );

    // A webhook with a bad signature is refused and changes nothing.
    const bad = await deliverWebhook(
      app,
      paymentCapturedEvent(order.body.orderId, paymentId, 88_500),
      { signature: 'bad' },
    );
    expect(bad.response.status).toBe(400);
    expect(await statusOf()).toBe('CONFIRMED');

    const captured = await deliverWebhook(
      app,
      paymentCapturedEvent(order.body.orderId, paymentId, 88_500),
    );
    expect(captured.response.status).toBe(200);
    expect(await statusOf()).toBe('COMMISSION_PAID');

    // The same event again, order.paid, and the browser's verify: none of them does anything more.
    expect(
      (
        await deliverWebhook(app, paymentCapturedEvent(order.body.orderId, paymentId, 88_500), {
          eventId: captured.eventId,
        })
      ).response.status,
    ).toBe(200);
    expect(
      (await deliverWebhook(app, orderPaidEvent(order.body.orderId, paymentId, 88_500))).response
        .status,
    ).toBe(200);
    const verified = await call.send(
      'post',
      '/api/payments/verify',
      brand.cookie,
      verifyBody(order.body.orderId, paymentId),
    );
    expect(verified.status).toBe(200);
    expect(verified.body.deal.status).toBe('COMMISSION_PAID');

    const rows = await db.select().from(payments).where(eq(payments.dealId, dealId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'CAPTURED', amountPaise: 88_500 });
    const invoiceRows = await db.select().from(invoices).where(eq(invoices.dealId, dealId));
    expect(invoiceRows.map((i) => i.number)).toEqual(['VS/2026-27/000001']);
    const events = await db.select().from(dealEvents).where(eq(dealEvents.dealId, dealId));
    expect(events.filter((e) => e.toStatus === 'COMMISSION_PAID')).toHaveLength(1);

    const [mailToBrand] = await sentTo('COMMISSION_PAID_BRAND');
    expect(await sentTo('COMMISSION_PAID_BRAND')).toHaveLength(1);
    expect(mailToBrand?.attachmentNames).toEqual(['VS-2026-27-000001.pdf']);
    expect(mailToBrand?.subject).toMatch(/ValueSkins fee paid/);
    expect(await sentTo('COMMISSION_PAID_CREATOR')).toHaveLength(1);
  });

  it('6. the advance: the brand reads who to pay, pays outside ValueSkins and records it; the creator confirms', async () => {
    // Only the brand is shown the full UPI ID, and only now.
    const due = await call.get(`/api/deals/${dealId}/direct-payment`, brand.cookie);
    expect(due.body).toMatchObject({
      stage: 'ADVANCE',
      amountPaise: expected.advancePaise,
      payee: { vpa: CREATOR_VPA },
    });
    expect((await call.get(`/api/deals/${dealId}/direct-payment`, creator.cookie)).status).toBe(
      403,
    );
    expect((await call.get(`/api/deals/${dealId}/direct-payment`, stranger.cookie)).status).toBe(
      404,
    );

    const recorded = await recordPayment(
      call,
      { cookie: brand.cookie, user: { id: brand.userId } },
      dealId,
      'ADVANCE',
      'E2EADVANCE01',
    );
    expect(recorded.status).toBe(201);
    expect(await statusOf()).toBe('COMMISSION_PAID');
    expect((await sentTo('DIRECT_PAYMENT_RECORDED'))[0]?.toEmail).toBe(PERSONAS.creator.email);

    // The creator is asked to confirm; nothing moves on the brand's word alone.
    expect((await call.get('/api/deals/mine', creator.cookie)).body.items[0]).toMatchObject({
      yourTurn: true,
      nextStep: 'CONFIRM_PAYMENT',
      receivedPaise: 0,
    });
    const creatorView = await call.get(`/api/deals/${dealId}`, creator.cookie);
    expect(JSON.stringify(creatorView.body)).not.toContain(CREATOR_VPA);

    const done = await confirmPayment(
      call,
      { cookie: creator.cookie, user: { id: creator.userId } },
      recorded.body.directPayment.id,
    );
    expect(done.body.deal.status).toBe('ADVANCE_PAID');
    expect((await call.get('/api/deals/mine', creator.cookie)).body.items[0]).toMatchObject({
      yourTurn: true,
      nextStep: 'UPLOAD_CONTENT',
      receivedPaise: expected.advancePaise,
    });
    const advanceMails = await sentTo('ADVANCE_PAID');
    expect(advanceMails.map((m) => m.toEmail).sort()).toEqual(
      [PERSONAS.brand.email, PERSONAS.creator.email].sort(),
    );
    expect(advanceMails[0]?.attachmentNames).toEqual(['VS-PR-2026-27-000001.pdf']);
  });

  it('7. content, a round of changes, a second upload and approval', async () => {
    const first = await call.send('post', `/api/deals/${dealId}/content`, creator.cookie, {
      link: DRIVE_LINK,
    });
    expect(first.body.deal.status).toBe('CONTENT_UPLOADED');
    expect((await call.get('/api/deals/mine', brand.cookie)).body.items[0]).toMatchObject({
      yourTurn: true,
      nextStep: 'REVIEW_CONTENT',
    });

    const changes = await call.send('post', `/api/deals/${dealId}/feedback`, brand.cookie, {
      feedback: '  Please make the caption shorter.  ',
    });
    expect(changes.body.deal).toMatchObject({
      status: 'REVISION_REQUESTED',
      revisionCount: 1,
      feedback: 'Please make the caption shorter.',
    });
    expect((await sentTo('CHANGES_REQUESTED'))[0]?.bodyText).toContain(
      'Please make the caption shorter.',
    );

    const second = await call.send('post', `/api/deals/${dealId}/content`, creator.cookie, {
      link: `${DRIVE_LINK}2`,
    });
    expect(second.body.deal.uploadCount).toBe(2);
    const approved = await call.send('post', `/api/deals/${dealId}/approve`, brand.cookie, {});
    expect(approved.body.deal.status).toBe('APPROVED');
    expect(await sentTo('CONTENT_UPLOADED')).toHaveLength(2);
    expect(await sentTo('CONTENT_APPROVED')).toHaveLength(1);
  });

  it('8. the final payment is recorded and confirmed, and the deal is COMPLETED', async () => {
    const due = await call.get(`/api/deals/${dealId}/direct-payment`, brand.cookie);
    expect(due.body).toMatchObject({ stage: 'FINAL', amountPaise: expected.finalPaise });
    const recorded = await recordPayment(
      call,
      { cookie: brand.cookie, user: { id: brand.userId } },
      dealId,
      'FINAL',
      'E2EFINAL0001',
    );
    expect(recorded.status).toBe(201);
    const done = await confirmPayment(
      call,
      { cookie: creator.cookie, user: { id: creator.userId } },
      recorded.body.directPayment.id,
    );
    expect(done.body.deal.status).toBe('COMPLETED');
    expect(done.body.deal.completedAt).not.toBeNull();

    expect((await call.get('/api/deals/mine', creator.cookie)).body.items[0]).toMatchObject({
      yourTurn: false,
      nextStep: null,
      receivedPaise: expected.advancePaise + expected.finalPaise,
    });
    expect(await sentTo('FINAL_PAYMENT_DONE')).toHaveLength(2);
    const reportMails = await sentTo('DEAL_REPORT_READY');
    expect(reportMails).toHaveLength(2);
    expect(
      reportMails.every((m) => m.attachmentNames?.[0] === `ValueSkins-Deal-Record-${shortId}.pdf`),
    ).toBe(true);
    expect(reportMails[0]?.subject).toMatch(/^Deal record ready/);
  });

  it('9. every document downloads for the brand, the creator and an admin, and for nobody else', async () => {
    const kinds = ['commission-invoice', 'advance-payment-record', 'final-payment-record', 'adp'];
    const names: Record<string, string> = {
      'commission-invoice': 'VS-2026-27-000001.pdf',
      'advance-payment-record': 'VS-PR-2026-27-000001.pdf',
      'final-payment-record': 'VS-PR-2026-27-000002.pdf',
      adp: `ValueSkins-Deal-Record-${shortId}.pdf`,
    };
    for (const who of [brand, creator, admin]) {
      for (const kind of kinds) {
        const res = await call.get(`/api/deals/${dealId}/documents/${kind}`, who.cookie);
        expect(res.status, kind).toBe(200);
        expect(isPdf(res.body), kind).toBe(true);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="${names[kind]}"`);
      }
    }
    for (const kind of kinds) {
      expect(
        (await call.get(`/api/deals/${dealId}/documents/${kind}`, stranger.cookie)).status,
      ).toBe(404);
      expect((await call.get(`/api/deals/${dealId}/documents/${kind}`)).status).toBe(401);
    }

    const detail = await call.get(`/api/deals/${dealId}`, creator.cookie);
    expect(detail.body.deal.documents.map((d: { kind: string }) => d.kind)).toEqual(kinds);
    expect(detail.body.deal.documents[0].number).toBe('VS/2026-27/000001');
    expect((await call.get(`/api/deals/${dealId}`, stranger.cookie)).status).toBe(404);
  });

  it('10. both sides see the same history, and a stranger sees none of it', async () => {
    const brandEvents = await call.get(`/api/deals/${dealId}/events`, brand.cookie);
    const creatorEvents = await call.get(`/api/deals/${dealId}/events`, creator.cookie);
    expect(creatorEvents.body).toEqual(brandEvents.body);
    const items = brandEvents.body.items as Array<{
      kind: string;
      fromStatus: string;
      toStatus: string;
      actor: { role: string };
    }>;
    expect(items.filter((i) => i.kind === 'PAYMENT_RECORDED')).toHaveLength(2);
    expect(items.filter((i) => i.kind === 'TRANSITION').map((i) => i.toStatus)).toEqual([
      'OPEN',
      'CONFIRMED',
      'COMMISSION_PAID',
      'ADVANCE_PAID',
      'CONTENT_UPLOADED',
      'REVISION_REQUESTED',
      'CONTENT_UPLOADED',
      'APPROVED',
      'COMPLETED',
    ]);
    expect(items.every((i) => ['BRAND', 'CREATOR', 'SYSTEM'].includes(i.actor.role))).toBe(true);

    const brandMail = await call.get(`/api/deals/${dealId}/emails`, brand.cookie);
    const creatorMail = await call.get(`/api/deals/${dealId}/emails`, creator.cookie);
    expect(brandMail.body.items.length).toBeGreaterThan(8);
    expect(creatorMail.body.items.length).toBeGreaterThan(8);
    expect(JSON.stringify(brandMail.body)).not.toMatch(/@example\.com/);
    for (const path of ['events', 'emails']) {
      expect((await call.get(`/api/deals/${dealId}/${path}`, stranger.cookie)).status).toBe(404);
    }
  });

  it('11. the emails: one per event, to the right people, in plain wording, with no UPI ID', async () => {
    const sent = await emailsOfDeal(dealId);
    const count = (template: string) => sent.filter((e) => e.template === template).length;
    expect({
      DEAL_PUBLISHED: count('DEAL_PUBLISHED'),
      NEW_APPLICATION: count('NEW_APPLICATION'),
      YOU_WERE_SELECTED: count('YOU_WERE_SELECTED'),
      COMMISSION_PAID_BRAND: count('COMMISSION_PAID_BRAND'),
      COMMISSION_PAID_CREATOR: count('COMMISSION_PAID_CREATOR'),
      DIRECT_PAYMENT_RECORDED: count('DIRECT_PAYMENT_RECORDED'),
      ADVANCE_PAID: count('ADVANCE_PAID'),
      CONTENT_UPLOADED: count('CONTENT_UPLOADED'),
      CHANGES_REQUESTED: count('CHANGES_REQUESTED'),
      CONTENT_APPROVED: count('CONTENT_APPROVED'),
      FINAL_PAYMENT_DONE: count('FINAL_PAYMENT_DONE'),
      DEAL_REPORT_READY: count('DEAL_REPORT_READY'),
      ADMIN_ALERT: count('ADMIN_ALERT'),
    }).toEqual({
      DEAL_PUBLISHED: 1,
      NEW_APPLICATION: 1,
      YOU_WERE_SELECTED: 1,
      COMMISSION_PAID_BRAND: 1,
      COMMISSION_PAID_CREATOR: 1,
      DIRECT_PAYMENT_RECORDED: 2,
      ADVANCE_PAID: 2,
      CONTENT_UPLOADED: 2,
      CHANGES_REQUESTED: 1,
      CONTENT_APPROVED: 1,
      FINAL_PAYMENT_DONE: 2,
      DEAL_REPORT_READY: 2,
      ADMIN_ALERT: 0,
    });
    expect(sent.every((e) => e.status === 'SENT')).toBe(true);

    const everything = await db.select().from(emailLog);
    for (const mail of everything) {
      const text = `${mail.subject}\n${mail.bodyText}`;
      expect(text, mail.template).not.toContain(CREATOR_VPA);
      expect(text, mail.template).not.toMatch(/commission/i);
      expect(text, mail.template).not.toMatch(/deal report/i);
      expect(text, mail.template).not.toContain('—');
      expect(text, mail.template).toContain('Questions? Write to');
    }
  });

  it('12. the UPI ID, the payer details and the contact numbers are in no stored text', async () => {
    const tables = {
      events: await db.select().from(dealEvents).where(eq(dealEvents.dealId, dealId)),
      webhooks: await db.select().from(webhookEvents),
      deal: await db.select().from(deals).where(eq(deals.id, dealId)),
    };
    const text = JSON.stringify(tables);
    for (const leaked of [
      CREATOR_VPA,
      'payer@example.com',
      'payer@okbank',
      '+919876543210',
      'Payer Name',
    ]) {
      expect(text, leaked).not.toContain(leaked);
    }
  });

  it('13. a realtime update went out for each step, once, to the deal room only', () => {
    const forDeal = emitted.filter((e) => e.event === 'deal:updated');
    expect(forDeal.every((e) => e.room === dealRoom(dealId))).toBe(true);
    expect(forDeal.map((e) => e.payload.status)).toEqual([
      'OPEN',
      'CONFIRMED',
      'COMMISSION_PAID',
      'COMMISSION_PAID',
      'ADVANCE_PAID',
      'CONTENT_UPLOADED',
      'REVISION_REQUESTED',
      'CONTENT_UPLOADED',
      'APPROVED',
      'APPROVED',
      'COMPLETED',
    ]);
    // One event for every committed transition, plus one for each recorded payment.
    expect(forDeal.length).toBe(11);
  });

  it('14. the resume of each side shows the completed deal, and the admin sees the finished deal', async () => {
    const creatorResume = await call.get(`/api/users/${creator.userId}/resume`, brand.cookie);
    expect(creatorResume.body.stats.completedDealsCount).toBe(1);
    expect(creatorResume.body.user.contactEmail).toBe(PERSONAS.creator.email);
    expect(creatorResume.body.completedDeals[0].budgetPaise).toBe(expected.budgetPaise);
    expect(JSON.stringify(creatorResume.body)).not.toContain(CREATOR_VPA);
    const brandResume = await call.get(`/api/users/${brand.userId}/resume`, creator.cookie);
    expect(brandResume.body.stats.completedDealsCount).toBe(1);

    const adminDeal = await call.get(`/api/admin/deals/${dealId}`, admin.cookie);
    expect(adminDeal.body.deal.status).toBe('COMPLETED');
    expect(adminDeal.body.emails.length).toBeGreaterThan(10);
    const list = await call.get('/api/admin/deals', admin.cookie);
    expect(list.body.items.find((d: { id: string }) => d.id === dealId)).toMatchObject({
      hasOpenDispute: false,
      awaitingConfirmation: false,
      contentOverdue: false,
    });
    expect(JSON.stringify(adminDeal.body)).not.toContain(CREATOR_VPA);
  });

  it('15. signing out ends the session', async () => {
    const out = await call.send('post', '/api/auth/logout', creator.cookie, {});
    expect(out.status).toBeLessThan(300);
    expect((await call.get('/api/me', creator.cookie)).status).toBe(401);
    expect((await call.get('/api/me', brand.cookie)).status).toBe(200);
  });
});
