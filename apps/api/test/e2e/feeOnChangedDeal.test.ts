import { feeCapturedDealChangedMessage } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { dealEvents, deals, emailLog, invoices, payments } from '../../src/db/schema/index.js';
import { closeDb, resetDb } from '../db/testDb.js';
import {
  deliverWebhook,
  orderPaidEvent,
  paymentCapturedEvent,
  verifyBody,
} from '../helpers/payments.js';
import { razorpayCaptured } from '../payments/fixture.js';
import { newOrdersState, ordersHandlers } from '../payments/razorpayOrdersMock.js';
import {
  PERSONAS,
  confirmedDeal,
  e2eApp,
  emailsOfDeal,
  instagramHandlers,
  openCheckout,
  signInActors,
  type Actors,
} from './harness.js';

/**
 * A fee captured on a deal that changed (SPEC 7.3): the brand cancelled while Razorpay Checkout
 * was open, and the payment went through anyway. The money is kept and flagged, nothing else
 * moves, every path that delivers the payment ends the same way, and the refund is made by hand
 * and recorded on a dispute (docs/RUNBOOK.md).
 */

const ctx = e2eApp();
const { app, call } = ctx;
const msw = setupServer(...instagramHandlers());
const razorpay = newOrdersState();
let actors: Actors;
let dealId: string;
let checkout: { orderId: string; amountPaise: number };
const PAYMENT_ID = 'pay_e2e_late';

beforeAll(async () => {
  msw.listen({ onUnhandledRequest: 'bypass' });
  msw.use(...ordersHandlers(razorpay));
  await resetDb();
  actors = await signInActors(ctx);
  ({ dealId } = await confirmedDeal(call, actors));
  checkout = await openCheckout(call, actors.brand, dealId);
});
afterAll(async () => {
  msw.close();
  await closeDb();
});

const countOf = async (template: string) =>
  (await emailsOfDeal(dealId)).filter((e) => e.template === template).length;

describe('the fee is captured after the brand cancelled', () => {
  it('1. the brand cancels while Checkout is open: no fee was charged, as far as ValueSkins knew', async () => {
    const res = await call.send('post', `/api/deals/${dealId}/cancel`, actors.brand.cookie, {
      reason: 'Changed plans',
    });
    expect(res.status).toBe(200);
    expect(res.body.deal.status).toBe('CANCELLED');
    const mails = (await emailsOfDeal(dealId)).filter((e) => e.template === 'DEAL_CANCELLED');
    expect(mails.length).toBeGreaterThan(0);
    expect(mails.every((m) => m.bodyText.includes('No fee was charged.'))).toBe(true);
  });

  it('2. Razorpay captures the payment: the webhook, a repeat, order.paid and verify all end the same way', async () => {
    razorpayCaptured(
      razorpay,
      { orderId: checkout.orderId, amount: checkout.amountPaise },
      'commission',
      {
        paymentId: PAYMENT_ID,
      },
    );
    const event = paymentCapturedEvent(checkout.orderId, PAYMENT_ID, checkout.amountPaise);

    // The webhook and the browser's verify arrive together, then every repeat.
    const [hook, verified] = await Promise.all([
      deliverWebhook(app, event),
      call.send(
        'post',
        '/api/payments/verify',
        actors.brand.cookie,
        verifyBody(checkout.orderId, PAYMENT_ID),
      ),
    ]);
    expect(hook.response.status).toBe(200);
    expect(verified.status).toBe(409);
    expect(verified.body.error.code).toBe('FEE_CAPTURED_DEAL_CHANGED');
    expect(verified.body.error.message).toBe(feeCapturedDealChangedMessage(checkout.amountPaise));
    expect(verified.body.error.message).toContain('₹885.00');
    expect(verified.body.error.message.toLowerCase()).toContain('refund');

    expect((await deliverWebhook(app, event, { eventId: hook.eventId })).response.status).toBe(200);
    expect(
      (
        await deliverWebhook(
          app,
          orderPaidEvent(checkout.orderId, PAYMENT_ID, checkout.amountPaise),
        )
      ).response.status,
    ).toBe(200);
    const again = await call.send(
      'post',
      '/api/payments/verify',
      actors.brand.cookie,
      verifyBody(checkout.orderId, PAYMENT_ID),
    );
    expect(again.status).toBe(409);
  });

  it('3. the money is kept and flagged once: captured, no invoice, the deal untouched', async () => {
    const rows = await db.select().from(payments).where(eq(payments.dealId, dealId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'CAPTURED',
      amountPaise: 88_500,
      razorpayPaymentId: PAYMENT_ID,
    });
    expect(await db.select().from(invoices).where(eq(invoices.dealId, dealId))).toEqual([]);
    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
    expect(deal).toMatchObject({ status: 'CANCELLED', commissionPaidAt: null });

    const events = await db.select().from(dealEvents).where(eq(dealEvents.dealId, dealId));
    const flagged = events.filter(
      (e) => (e.metadata as { kind?: string } | null)?.kind === 'FEE_CAPTURED_DEAL_CHANGED',
    );
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({
      fromStatus: 'CANCELLED',
      toStatus: 'CANCELLED',
      actorType: 'SYSTEM',
    });
    expect(events.filter((e) => e.toStatus === 'COMMISSION_PAID')).toEqual([]);
  });

  it('4. the admin is alerted once and the brand is told once; no "fee paid" email goes out', async () => {
    const alerts = (await db.select().from(emailLog)).filter(
      (e) => e.template === 'ADMIN_ALERT' && e.subject.includes('refund by hand'),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.toEmail).toBe(ctx.env.DISPUTE_EMAIL);
    expect(alerts[0]?.bodyText).toContain(
      (await db.select().from(deals).where(eq(deals.id, dealId)))[0]!.shortId,
    );

    expect(await countOf('FEE_CAPTURED_DEAL_CHANGED')).toBe(1);
    const [brandMail] = (await emailsOfDeal(dealId)).filter(
      (e) => e.template === 'FEE_CAPTURED_DEAL_CHANGED',
    );
    expect(brandMail?.toEmail).toBe(PERSONAS.brand.email);
    expect(brandMail?.bodyText).toContain('₹885.00');
    expect(await countOf('COMMISSION_PAID_BRAND')).toBe(0);
    expect(await countOf('COMMISSION_PAID_CREATOR')).toBe(0);
  });

  it('5. no document is issued for it, and the brand cannot pay for the cancelled deal again', async () => {
    const invoice = await call.get(
      `/api/deals/${dealId}/documents/commission-invoice`,
      actors.brand.cookie,
    );
    expect(invoice.status).toBe(409);
    expect(invoice.body.error.code).toBe('DOCUMENT_NOT_AVAILABLE');
    const order = await call.send(
      'post',
      `/api/deals/${dealId}/payments/commission/order`,
      actors.brand.cookie,
      {},
    );
    expect(order.status).toBe(409);
    expect(order.body.error.code).toBe('WRONG_DEAL_STATUS');
  });

  it('6. the flagged payment shows in the history both sides and the admin read', async () => {
    const brandHistory = await call.get(`/api/deals/${dealId}/events`, actors.brand.cookie);
    const last = brandHistory.body.items.at(-1);
    expect(last).toMatchObject({
      fromStatus: 'CANCELLED',
      toStatus: 'CANCELLED',
      actor: { type: 'SYSTEM', role: 'SYSTEM' },
    });
    expect((await call.get(`/api/deals/${dealId}/events`, actors.creator.cookie)).body).toEqual(
      brandHistory.body,
    );
    const adminView = await call.get(`/api/admin/deals/${dealId}`, actors.admin.cookie);
    expect(adminView.body.payments[0]).toMatchObject({ status: 'CAPTURED', invoiceNumber: null });
  });

  it('7. the refund is made by hand; the brand raises a dispute and the admin records the reference', async () => {
    const raised = await call.send('post', `/api/deals/${dealId}/disputes`, actors.brand.cookie, {
      subject: 'Fee taken after the deal was cancelled',
      description: 'I cancelled the deal and the fee was still charged.',
    });
    expect(raised.status).toBe(201);

    const resolved = await call.send(
      'post',
      `/api/admin/disputes/${raised.body.dispute.id}/resolve`,
      actors.admin.cookie,
      { resolution: 'Refunded the fee in the Razorpay dashboard.', refundReference: 'rfnd_E2EFEE' },
    );
    expect(resolved.status).toBe(200);
    expect(resolved.body.dispute).toMatchObject({
      status: 'RESOLVED',
      refundReference: 'rfnd_E2EFEE',
    });

    const mails = (await emailsOfDeal(dealId)).filter((e) => e.template === 'DISPUTE_RESOLVED');
    expect(mails.map((m) => m.toEmail).sort()).toEqual(
      [PERSONAS.brand.email, PERSONAS.creator.email].sort(),
    );
    expect(mails.every((m) => m.bodyText.includes('Refund reference: rfnd_E2EFEE'))).toBe(true);

    // The deal page lists the dispute for both sides, without the resolution text or the reference.
    for (const cookie of [actors.brand.cookie, actors.creator.cookie]) {
      const detail = (await call.get(`/api/deals/${dealId}`, cookie)).body.deal;
      expect(detail.disputes).toHaveLength(1);
      expect(detail.disputes[0].status).toBe('RESOLVED');
      expect(JSON.stringify(detail.disputes)).not.toContain('rfnd_E2EFEE');
    }
  });
});
