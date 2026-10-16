import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_CANCEL_WINDOW } from '@valueskins/shared';
import { db } from '../../src/db/client.js';
import { dealEvents, invoices, payments } from '../../src/db/schema/index.js';
import { closeDb, resetDb } from '../db/testDb.js';
import { DRIVE_LINK } from '../helpers/lifecycle.js';
import { confirmPayment, recordPayment } from '../payments/fixture.js';
import { newOrdersState, ordersHandlers } from '../payments/razorpayOrdersMock.js';
import {
  PERSONAS,
  e2eApp,
  emailsOfDeal,
  feePaidDeal,
  instagramHandlers,
  isPdf,
  signInActors,
  type Actors,
} from './harness.js';

/**
 * An admin cancels a deal after the fee (REPLACEMENT_PLAN 2.6): the fee is kept, nobody else can
 * cancel, and the refund the parties arrange by hand is a field on the event, not text in a note.
 */

const ctx = e2eApp();
const { app, call } = ctx;
const msw = setupServer(...instagramHandlers());
const razorpay = newOrdersState();
let actors: Actors;
let dealId: string;
const NOTE = 'The creator stopped answering; the brand will be refunded by hand.';

const brandSession = () => ({ cookie: actors.brand.cookie, user: { id: actors.brand.userId } });
const creatorSession = () => ({
  cookie: actors.creator.cookie,
  user: { id: actors.creator.userId },
});

beforeAll(async () => {
  msw.listen({ onUnhandledRequest: 'bypass' });
  msw.use(...ordersHandlers(razorpay));
  await resetDb();
  actors = await signInActors(ctx);
  ({ dealId } = await feePaidDeal(ctx, actors, razorpay));
  // The advance arrived, and the creator has uploaded content that nobody has approved.
  const recorded = await recordPayment(call, brandSession(), dealId, 'ADVANCE', 'E2ECANCEL001');
  await confirmPayment(call, creatorSession(), recorded.body.directPayment.id);
  await call.send('post', `/api/deals/${dealId}/content`, actors.creator.cookie, {
    link: DRIVE_LINK,
  });
});
afterAll(async () => {
  msw.close();
  await closeDb();
});

describe('an admin cancels after the fee', () => {
  it('1. nobody but an admin can cancel once the fee is paid', async () => {
    const brandTry = await call.send('post', `/api/deals/${dealId}/cancel`, actors.brand.cookie, {
      reason: 'Changed my mind',
    });
    expect(brandTry.status).toBe(409);
    expect(brandTry.body.error.code).toBe('CANCELLATION_NOT_POSSIBLE');
    const creatorTry = await call.send(
      'post',
      `/api/deals/${dealId}/cancel`,
      actors.creator.cookie,
      { reason: 'Too busy' },
    );
    expect(creatorTry.status).toBe(403);
    const adminDeal = (await call.get(`/api/admin/deals/${dealId}`, actors.admin.cookie)).body.deal;
    expect(adminDeal.status).toBe('CONTENT_UPLOADED');

    // Not as a plain user either: the admin route is a 404 to them.
    for (const cookie of [actors.brand.cookie, actors.creator.cookie]) {
      const res = await call.send('post', `/api/admin/deals/${dealId}/cancel`, cookie, {
        note: NOTE,
      });
      expect(res.status).toBe(404);
    }
  });

  it('2. the admin needs a note, and the refund reference is optional', async () => {
    const missing = await call.send(
      'post',
      `/api/admin/deals/${dealId}/cancel`,
      actors.admin.cookie,
      {},
    );
    expect(missing.status).toBe(400);
    const blank = await call.send(
      'post',
      `/api/admin/deals/${dealId}/cancel`,
      actors.admin.cookie,
      { note: '   ' },
    );
    expect(blank.status).toBe(400);
    expect((await call.get(`/api/deals/${dealId}`, actors.brand.cookie)).body.deal.status).toBe(
      'CONTENT_UPLOADED',
    );
  });

  it('3. the admin cancels: CANCELLED, by an admin, with the reason and the refund reference', async () => {
    const res = await call.send('post', `/api/admin/deals/${dealId}/cancel`, actors.admin.cookie, {
      note: NOTE,
      refundReference: 'rfnd_E2E001',
    });
    expect(res.status).toBe(200);

    for (const cookie of [actors.brand.cookie, actors.creator.cookie]) {
      const deal = (await call.get(`/api/deals/${dealId}`, cookie)).body.deal;
      expect(deal).toMatchObject({
        status: 'CANCELLED',
        cancelledByRole: 'ADMIN',
        cancellationReason: NOTE,
      });
    }
    const mine = (await call.get('/api/deals/mine', actors.brand.cookie)).body.items[0];
    expect(mine).toMatchObject({
      cancelledByRole: 'ADMIN',
      cancellationReason: NOTE,
      yourTurn: false,
      nextStep: null,
    });
  });

  it('4. the event keeps the refund reference as a field, and the note stays plain', async () => {
    const history = await call.get(`/api/deals/${dealId}/events`, actors.brand.cookie);
    const last = history.body.items.at(-1);
    expect(last).toMatchObject({
      kind: 'TRANSITION',
      toStatus: 'CANCELLED',
      note: NOTE,
      refundReference: 'rfnd_E2E001',
      actor: { type: 'ADMIN', role: 'ADMIN' },
    });
    expect(last.note).not.toContain('rfnd_E2E001');
    const [row] = await db.select().from(dealEvents).where(eq(dealEvents.toStatus, 'CANCELLED'));
    expect(row?.actorType).toBe('ADMIN');
  });

  it('5. both are emailed, and the email says the fee was kept', async () => {
    const mails = (await emailsOfDeal(dealId)).filter((e) => e.template === 'DEAL_CANCELLED');
    expect(mails.map((m) => m.toEmail).sort()).toEqual(
      [PERSONAS.brand.email, PERSONAS.creator.email].sort(),
    );
    for (const mail of mails) {
      expect(mail.bodyText).toContain('The fee already paid was kept.');
      expect(mail.bodyText).toContain(NOTE);
    }
  });

  it('6. the fee stays captured and every document issued before still downloads', async () => {
    const [payment] = await db.select().from(payments).where(eq(payments.dealId, dealId));
    expect(payment?.status).toBe('CAPTURED');
    expect(await db.select().from(invoices).where(eq(invoices.dealId, dealId))).toHaveLength(2);
    for (const kind of ['commission-invoice', 'advance-payment-record']) {
      for (const cookie of [actors.brand.cookie, actors.creator.cookie, actors.admin.cookie]) {
        const res = await call.get(`/api/deals/${dealId}/documents/${kind}`, cookie);
        expect(res.status, kind).toBe(200);
        expect(isPdf(res.body)).toBe(true);
      }
    }
    // The final record and the deal record were never issued.
    for (const kind of ['final-payment-record', 'adp']) {
      expect(
        (await call.get(`/api/deals/${dealId}/documents/${kind}`, actors.brand.cookie)).status,
      ).toBe(409);
    }
  });

  it('7. nothing more can happen on the deal', async () => {
    const upload = await call.send('post', `/api/deals/${dealId}/content`, actors.creator.cookie, {
      link: DRIVE_LINK,
    });
    expect(upload.status).toBe(409);
    const approve = await call.send(
      'post',
      `/api/deals/${dealId}/approve`,
      actors.brand.cookie,
      {},
    );
    expect(approve.status).toBe(409);
    const again = await call.send(
      'post',
      `/api/admin/deals/${dealId}/cancel`,
      actors.admin.cookie,
      { note: NOTE },
    );
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe(ADMIN_CANCEL_WINDOW);
    const actions = (await call.get(`/api/deals/${dealId}`, actors.brand.cookie)).body.deal
      .allowedActions;
    // Only a dispute can still be raised on a cancelled deal that had a creator (SPEC 12).
    expect(
      actions
        .filter((a: { enabled: boolean }) => a.enabled)
        .map((a: { action: string }) => a.action),
    ).toEqual(['RAISE_DISPUTE']);
  });

  it('8. a payment waiting for the creator cannot be confirmed after the cancel', async () => {
    // A second deal: advance recorded and waiting, then the admin cancels.
    const { dealId: id } = await feePaidDeal(ctx, actors, razorpay);
    const recorded = await recordPayment(call, brandSession(), id, 'ADVANCE', 'E2ECANCEL002');
    expect(recorded.status).toBe(201);
    const cancel = await call.send('post', `/api/admin/deals/${id}/cancel`, actors.admin.cookie, {
      note: NOTE,
    });
    expect(cancel.status).toBe(200);

    const late = await confirmPayment(call, creatorSession(), recorded.body.directPayment.id);
    expect(late.status).toBe(409);
    expect((await call.get(`/api/deals/${id}`, actors.creator.cookie)).body.deal.status).toBe(
      'CANCELLED',
    );
    expect(app).toBeTruthy();
  });
});
