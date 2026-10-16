import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { dealEvents, directPayments, emailLog } from '../../src/db/schema/index.js';
import { closeDb, resetDb } from '../db/testDb.js';
import { confirmPayment, notReceived, recordPayment } from '../payments/fixture.js';
import { newOrdersState, ordersHandlers } from '../payments/razorpayOrdersMock.js';
import {
  CREATOR_VPA,
  PERSONAS,
  e2eApp,
  emailsOfDeal,
  feePaidDeal,
  instagramHandlers,
  signInActors,
  type Actors,
} from './harness.js';

/**
 * "Not received" (REPLACEMENT_PLAN 2.1) through the live endpoints: the brand records an advance,
 * the creator says it never arrived, the record is kept and marked, the brand records again, and
 * only the creator's "received" moves the deal.
 */

const ctx = e2eApp();
const { env, app, call } = ctx;
const msw = setupServer(...instagramHandlers());
const razorpay = newOrdersState();
let actors: Actors;
let dealId: string;
let firstId: string;
let secondId: string;

const brandSession = () => ({ cookie: actors.brand.cookie, user: { id: actors.brand.userId } });
const creatorSession = () => ({
  cookie: actors.creator.cookie,
  user: { id: actors.creator.userId },
});
const rows = () => db.select().from(directPayments).where(eq(directPayments.dealId, dealId));

beforeAll(async () => {
  msw.listen({ onUnhandledRequest: 'bypass' });
  msw.use(...ordersHandlers(razorpay));
  await resetDb();
  actors = await signInActors(ctx);
  ({ dealId } = await feePaidDeal(ctx, actors, razorpay));
});
afterAll(async () => {
  msw.close();
  await closeDb();
});

describe('a UPI payment that did not arrive, then a second try', () => {
  it('1. the brand records the advance; the deal does not move and the creator is asked to confirm', async () => {
    const res = await recordPayment(call, brandSession(), dealId, 'ADVANCE', 'E2ENOTREC001');
    expect(res.status).toBe(201);
    firstId = res.body.directPayment.id;
    expect(res.body.directPayment.status).toBe('AWAITING_CONFIRMATION');
    expect((await call.get(`/api/deals/${dealId}`, actors.brand.cookie)).body.deal.status).toBe(
      'COMMISSION_PAID',
    );

    const brandActions = (await call.get(`/api/deals/${dealId}`, actors.brand.cookie)).body.deal
      .allowedActions;
    expect(brandActions.find((a: { action: string }) => a.action === 'PAY_ADVANCE')).toMatchObject({
      enabled: false,
    });
    const creatorActions = (await call.get(`/api/deals/${dealId}`, actors.creator.cookie)).body.deal
      .allowedActions;
    expect(
      creatorActions.find((a: { action: string }) => a.action === 'CONFIRM_PAYMENT_RECEIVED'),
    ).toMatchObject({ enabled: true });
  });

  it('2. while it waits, a second record is refused', async () => {
    const res = await recordPayment(call, brandSession(), dealId, 'ADVANCE', 'E2ENOTREC002');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DIRECT_PAYMENT_ALREADY_RECORDED');
    expect(await rows()).toHaveLength(1);
  });

  it('3. only the confirmed creator can say it did not arrive', async () => {
    for (const cookie of [actors.brand.cookie, actors.admin.cookie]) {
      const res = await call.send('post', `/api/direct-payments/${firstId}/not-received`, cookie, {
        reason: 'Nothing arrived',
      });
      expect([403, 404]).toContain(res.status);
    }
    expect((await rows())[0]?.disputedAt).toBeNull();
  });

  it('4. the creator says it did not arrive: the record is kept and marked, the deal stays, both are told', async () => {
    const res = await notReceived(call, creatorSession(), firstId, 'Nothing in my account');
    expect(res.status).toBe(200);
    expect((await call.get(`/api/deals/${dealId}`, actors.creator.cookie)).body.deal.status).toBe(
      'COMMISSION_PAID',
    );

    const [row] = await rows();
    expect(row).toMatchObject({
      reference: 'E2ENOTREC001',
      disputeReason: 'Nothing in my account',
    });
    expect(row?.disputedAt).not.toBeNull();
    expect(row?.confirmedAt).toBeNull();

    const mails = (await emailsOfDeal(dealId)).filter(
      (e) => e.template === 'DIRECT_PAYMENT_NOT_RECEIVED',
    );
    expect(mails.map((m) => m.toEmail).sort()).toEqual(
      [PERSONAS.brand.email, PERSONAS.creator.email].sort(),
    );
    const alerts = (await emailsOfDeal(dealId)).filter((e) => e.template === 'ADMIN_ALERT');
    expect(
      alerts.length +
        (await db.select().from(emailLog).where(eq(emailLog.template, 'ADMIN_ALERT'))).length,
    ).toBeGreaterThan(0);

    const events = await db.select().from(dealEvents).where(eq(dealEvents.dealId, dealId));
    const notReceivedEvents = events.filter(
      (e) => (e.metadata as { kind?: string } | null)?.kind === 'PAYMENT_NOT_RECEIVED',
    );
    expect(notReceivedEvents).toHaveLength(1);
    expect(notReceivedEvents[0]).toMatchObject({
      fromStatus: 'COMMISSION_PAID',
      toStatus: 'COMMISSION_PAID',
      note: 'Nothing in my account',
    });
  });

  it('5. a record that was decided cannot be decided again, by either button', async () => {
    const again = await notReceived(call, creatorSession(), firstId);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('DIRECT_PAYMENT_NOT_PENDING');
    const confirm = await confirmPayment(call, creatorSession(), firstId);
    expect(confirm.status).toBe(409);
    expect(confirm.body.error.code).toBe('DIRECT_PAYMENT_NOT_PENDING');
    expect(
      await call.get(`/api/deals/${dealId}`, actors.brand.cookie).then((r) => r.body.deal.status),
    ).toBe('COMMISSION_PAID');
  });

  it('6. the brand can pay again: the action is open and the second record is a new row', async () => {
    const brandActions = (await call.get(`/api/deals/${dealId}`, actors.brand.cookie)).body.deal
      .allowedActions;
    expect(brandActions.find((a: { action: string }) => a.action === 'PAY_ADVANCE')).toMatchObject({
      enabled: true,
    });
    const due = await call.get(`/api/deals/${dealId}/direct-payment`, actors.brand.cookie);
    expect(due.body).toMatchObject({ stage: 'ADVANCE', payee: { vpa: CREATOR_VPA } });

    const res = await recordPayment(call, brandSession(), dealId, 'ADVANCE', 'E2ENOTREC002');
    expect(res.status).toBe(201);
    secondId = res.body.directPayment.id;
    expect(secondId).not.toBe(firstId);
    expect(await rows()).toHaveLength(2);
  });

  it('7. the creator confirms the second one: the deal moves, and the first record is untouched', async () => {
    const before = (await rows()).find((r) => r.id === firstId);
    const res = await confirmPayment(call, creatorSession(), secondId);
    expect(res.status).toBe(200);
    expect(res.body.deal.status).toBe('ADVANCE_PAID');

    const after = (await rows()).find((r) => r.id === firstId);
    expect(after).toEqual(before);

    // The payment record document is for the one that arrived; the history shows both attempts.
    const detail = await call.get(`/api/deals/${dealId}`, actors.brand.cookie);
    expect(detail.body.deal.directPayments.map((p: { status: string }) => p.status)).toEqual([
      'DISPUTED',
      'CONFIRMED',
    ]);
    expect(JSON.stringify(detail.body)).not.toContain(CREATOR_VPA);
    const kinds = detail.body.deal.documents.map((d: { kind: string }) => d.kind);
    expect(kinds).toEqual(['commission-invoice', 'advance-payment-record']);

    const history = await call.get(`/api/deals/${dealId}/events`, actors.creator.cookie);
    expect(
      history.body.items
        .map((i: { kind: string }) => i.kind)
        .filter((k: string) => k !== 'TRANSITION'),
    ).toEqual(['PAYMENT_RECORDED', 'PAYMENT_NOT_RECEIVED', 'PAYMENT_RECORDED']);
  });

  it('8. the deal record lists both attempts, and nothing else leaked the UPI ID', async () => {
    const mails = await db.select().from(emailLog);
    expect(JSON.stringify(mails)).not.toContain(CREATOR_VPA);
    expect(env.SUPPORT_EMAIL).toBeTruthy();
  });
});
