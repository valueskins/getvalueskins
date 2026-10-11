import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import {
  dealEvents,
  deals,
  directPayments,
  disputes,
  emailLog,
  invoices,
  users,
} from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { adminUser } from '../admin/helpers.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http as api,
  insertDeal,
  sentEmails,
  testVpa,
} from '../helpers/deals.js';
import { confirmPayment, notReceived, recordPayment } from '../payments/fixture.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();
const app = createApp(env, {
  now: () => NOW,
  razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} },
});
const call = api(app);
const server = setupServer();
let razorpay: OrdersMockState;

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
  razorpay = newOrdersState();
  server.use(...ordersHandlers(razorpay));
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await closeDb();
});

/** A deal in `status` with a confirmed creator who has saved UPI details. */
async function dealIn(status: 'COMMISSION_PAID' | 'APPROVED' | 'CONFIRMED' = 'COMMISSION_PAID') {
  const brand = await brandWithBilling();
  const creator = await creatorWithPayout();
  const deal = await insertDeal(brand.user.id, status, { creatorId: creator.user.id });
  const [row] = await db.select().from(users).where(eq(users.id, creator.user.id));
  return { brand, creator, deal, vpa: row!.payoutVpa as string, name: row!.payoutName as string };
}

const info = (cookie: string | undefined, dealId: string) =>
  call.get(`/api/deals/${dealId}/direct-payment`, cookie);
const statusOf = async (dealId: string) =>
  (await db.select().from(deals).where(eq(deals.id, dealId)))[0]!.status;

describe('GET /api/deals/:id/direct-payment', () => {
  it('gives the brand the stage due, the frozen amount, the creator UPI ID and name, and the link', async () => {
    const f = await dealIn('COMMISSION_PAID');
    const res = await info(f.brand.cookie, f.deal.id);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body).toMatchObject({
      blocked: null,
      stage: 'ADVANCE',
      amountPaise: f.deal.advancePaise,
      payee: { vpa: f.vpa, name: f.name },
      upi: {
        pa: f.vpa,
        pn: f.name,
        am: '2775.00',
        cu: 'INR',
        tn: `ValueSkins ${f.deal.shortId} advance`,
      },
      record: null,
    });
    expect(res.body.upiUri).toBe(
      `upi://pay?pa=${encodeURIComponent(f.vpa)}&pn=${encodeURIComponent(f.name)}&am=2775.00&cu=INR&tn=${encodeURIComponent(`ValueSkins ${f.deal.shortId} advance`)}`,
    );
  });

  it('the final is due once the content is approved', async () => {
    const f = await dealIn('APPROVED');
    const res = await info(f.brand.cookie, f.deal.id);
    expect(res.body).toMatchObject({
      stage: 'FINAL',
      amountPaise: f.deal.finalPaise,
      upi: { am: '6475.00', tn: `ValueSkins ${f.deal.shortId} final` },
    });
  });

  it('says why nothing is due: no creator, not due, no UPI ID, no consent', async () => {
    const brand = await brandWithBilling();
    const blockedFor = async (
      status: 'OPEN' | 'CONFIRMED' | 'COMMISSION_PAID',
      creatorId: string | null,
    ) => {
      const deal = await insertDeal(brand.user.id, status, { creatorId });
      const res = await info(brand.cookie, deal.id);
      expect(res.status).toBe(200);
      // Nothing about the creator's payout details is in a blocked answer.
      expect(res.body).toMatchObject({
        stage: null,
        amountPaise: null,
        payee: null,
        upi: null,
        upiUri: null,
      });
      return res.body.blocked as string;
    };
    const ready = await creatorWithPayout();
    const noUpi = await creatorWithPayout(null);
    const noConsent = await creatorWithPayout(null, {
      payoutVpa: testVpa(900),
      payoutName: 'No Consent',
    });

    expect(await blockedFor('OPEN', null)).toBe('no_creator');
    expect(await blockedFor('CONFIRMED', ready.user.id)).toBe('not_due');
    expect(await blockedFor('COMMISSION_PAID', noUpi.user.id)).toBe('creator_has_no_upi');
    expect(await blockedFor('COMMISSION_PAID', noConsent.user.id)).toBe('no_consent');
  });

  it('is only for the deal brand: another brand, a creator, an admin and a signed-out caller get no UPI ID', async () => {
    const f = await dealIn('COMMISSION_PAID');
    const otherBrand = await brandWithBilling();
    const admin = await adminUser();

    expect((await info(otherBrand.cookie, f.deal.id)).status).toBe(404);
    expect((await info(f.creator.cookie, f.deal.id)).status).toBe(403);
    expect((await info(admin.cookie, f.deal.id)).status).toBe(403);
    expect((await info(undefined, f.deal.id)).status).toBe(401);
    expect((await info(f.brand.cookie, 'nope')).status).toBe(404);
    for (const who of [otherBrand, f.creator, admin]) {
      const res = await info(who.cookie, f.deal.id);
      expect(JSON.stringify(res.body)).not.toContain(f.vpa);
    }
  });
});

describe('POST /api/deals/:id/direct-payment', () => {
  it('records the payment with the frozen amount and the creator UPI ID, and never changes the status', async () => {
    const f = await dealIn('COMMISSION_PAID');
    const res = await recordPayment(call, f.brand, f.deal.id, 'ADVANCE', 'UTR123456789', {
      note: 'paid at noon',
    });
    expect(res.status).toBe(201);
    expect(res.body.directPayment).toMatchObject({
      stage: 'ADVANCE',
      amountPaise: f.deal.advancePaise,
      reference: 'UTR123456789',
      note: 'paid at noon',
      status: 'AWAITING_CONFIRMATION',
      confirmedAt: null,
      disputedAt: null,
    });
    // The response and the deal show the UPI ID masked.
    expect(JSON.stringify(res.body)).not.toContain(f.vpa);
    expect(res.body.directPayment.maskedVpa).toContain('•••');

    const [row] = await db
      .select()
      .from(directPayments)
      .where(eq(directPayments.dealId, f.deal.id));
    expect(row).toMatchObject({
      amountPaise: f.deal.advancePaise,
      paidToVpa: f.vpa,
      recordedBy: f.brand.user.id,
      confirmedAt: null,
    });
    // No status change, no deal event, no deal date.
    expect(await statusOf(f.deal.id)).toBe('COMMISSION_PAID');
    expect(await db.select().from(dealEvents).where(eq(dealEvents.dealId, f.deal.id))).toHaveLength(
      0,
    );
    expect(
      (await db.select().from(deals).where(eq(deals.id, f.deal.id)))[0]?.advancePaidAt,
    ).toBeNull();
  });

  it('takes the amount from the deal, never from the client', async () => {
    const f = await dealIn('COMMISSION_PAID');
    for (const extra of [{ amount: 1 }, { amountPaise: 1 }, { paidToVpa: 'x@ybl' }]) {
      const res = await recordPayment(call, f.brand, f.deal.id, 'ADVANCE', 'UTR123456789', extra);
      expect(res.status).toBe(400);
    }
    expect(await db.select().from(directPayments)).toHaveLength(0);
  });

  it('checks the reference', async () => {
    const f = await dealIn('COMMISSION_PAID');
    for (const reference of ['short', 'x'.repeat(41), 'has space 123', 'bad_char_12', '']) {
      expect((await recordPayment(call, f.brand, f.deal.id, 'ADVANCE', reference)).status).toBe(
        400,
      );
    }
    expect((await recordPayment(call, f.brand, f.deal.id, 'ADVANCE', '4312/AB-12')).status).toBe(
      201,
    );
  });

  it('only the stage that is due can be recorded', async () => {
    const f = await dealIn('COMMISSION_PAID');
    const res = await recordPayment(call, f.brand, f.deal.id, 'FINAL');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WRONG_DEAL_STATUS');
    const early = await dealIn('CONFIRMED');
    expect((await recordPayment(call, early.brand, early.deal.id, 'ADVANCE')).status).toBe(409);
    expect(await db.select().from(directPayments)).toHaveLength(0);
  });

  it('a creator without UPI details cannot be paid yet', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout(null);
    const deal = await insertDeal(brand.user.id, 'COMMISSION_PAID', { creatorId: creator.user.id });
    const res = await recordPayment(call, brand, deal.id, 'ADVANCE');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CREATOR_PAYOUT_NOT_SET');
  });

  it('a second record while one waits for the creator is refused, and shown in the info', async () => {
    const f = await dealIn('COMMISSION_PAID');
    const first = await recordPayment(call, f.brand, f.deal.id, 'ADVANCE', 'FIRSTREF123');
    const second = await recordPayment(call, f.brand, f.deal.id, 'ADVANCE', 'SECONDREF12');
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DIRECT_PAYMENT_ALREADY_RECORDED');
    expect(await db.select().from(directPayments)).toHaveLength(1);

    const shown = await info(f.brand.cookie, f.deal.id);
    expect(shown.body.record).toMatchObject({
      id: first.body.directPayment.id,
      status: 'AWAITING_CONFIRMATION',
    });
  });

  it('two records at once make one', async () => {
    const f = await dealIn('COMMISSION_PAID');
    const results = await Promise.all([
      recordPayment(call, f.brand, f.deal.id, 'ADVANCE', 'RACEREF0001'),
      recordPayment(call, f.brand, f.deal.id, 'ADVANCE', 'RACEREF0002'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.select().from(directPayments)).toHaveLength(1);
  });

  it('emails the creator once (email 17), with the reference and no UPI ID', async () => {
    const f = await dealIn('COMMISSION_PAID');
    await recordPayment(call, f.brand, f.deal.id, 'ADVANCE', 'UTR123456789');
    const mails = await sentEmails('DIRECT_PAYMENT_RECORDED');
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ toEmail: f.creator.user.email, dealId: f.deal.id });
    expect(mails[0]?.bodyText).toContain('UTR123456789');
    expect(mails[0]?.bodyText).toContain('Check your UPI app and confirm');
    expect(mails[0]?.bodyText).not.toContain(f.vpa);
  });

  it('is for the deal brand only', async () => {
    const f = await dealIn('COMMISSION_PAID');
    const otherBrand = await brandWithBilling();
    expect((await recordPayment(call, otherBrand, f.deal.id, 'ADVANCE')).status).toBe(404);
    expect((await recordPayment(call, f.creator, f.deal.id, 'ADVANCE')).status).toBe(403);
    expect(
      (
        await call.send('post', `/api/deals/${f.deal.id}/direct-payment`, undefined, {
          stage: 'ADVANCE',
          reference: 'UTR123456',
        })
      ).status,
    ).toBe(401);
    expect(await db.select().from(directPayments)).toHaveLength(0);
  });

  it('is rate limited: 10 an hour per brand, then 429 with Retry-After', async () => {
    const f = await dealIn('COMMISSION_PAID');
    for (let i = 0; i < 10; i++) {
      // Not the first one, and none succeed twice: they all fail validation but count.
      await recordPayment(
        call,
        f.brand,
        f.deal.id,
        'ADVANCE',
        i === 0 ? 'UTR123456789' : 'UTR12345678' + i,
      );
    }
    const limited = await recordPayment(call, f.brand, f.deal.id, 'ADVANCE', 'UTR999999999');
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });
});

describe('POST /api/direct-payments/:id/confirm', () => {
  async function recorded(status: 'COMMISSION_PAID' | 'APPROVED' = 'COMMISSION_PAID') {
    const f = await dealIn(status);
    const stage = status === 'COMMISSION_PAID' ? 'ADVANCE' : 'FINAL';
    const res = await recordPayment(call, f.brand, f.deal.id, stage);
    return { ...f, stage, recordId: res.body.directPayment.id as string };
  }

  it('advances the deal exactly one step, sets the date, writes the event and issues the record', async () => {
    const f = await recorded('COMMISSION_PAID');
    const res = await confirmPayment(call, f.creator, f.recordId);
    expect(res.status).toBe(200);
    expect(res.body.directPayment).toMatchObject({
      status: 'CONFIRMED',
      confirmedAt: NOW.toISOString(),
    });
    expect(res.body.deal).toMatchObject({
      status: 'ADVANCE_PAID',
      advancePaidAt: NOW.toISOString(),
    });

    expect(await statusOf(f.deal.id)).toBe('ADVANCE_PAID');
    const [event] = await db.select().from(dealEvents).where(eq(dealEvents.dealId, f.deal.id));
    expect(event).toMatchObject({
      fromStatus: 'COMMISSION_PAID',
      toStatus: 'ADVANCE_PAID',
      actorType: 'USER',
      actorId: f.creator.user.id,
      metadata: { directPaymentId: f.recordId, stage: 'ADVANCE' },
    });
    // The UPI ID is in neither the event nor its metadata.
    expect(JSON.stringify(event)).not.toContain(f.vpa);

    const [row] = await db.select().from(directPayments).where(eq(directPayments.id, f.recordId));
    expect(row).toMatchObject({ confirmedBy: f.creator.user.id, disputedAt: null });
    const [record] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.directPaymentId, f.recordId));
    expect(record).toMatchObject({
      kind: 'ADVANCE_PAYMENT_RECORD',
      paymentId: null,
      number: 'VS-PR/2026-27/000001',
    });
    expect(JSON.stringify(record?.snapshot)).not.toContain(f.vpa);
  });

  it('the final completes the deal and sends the deal report', async () => {
    const f = await recorded('APPROVED');
    const res = await confirmPayment(call, f.creator, f.recordId);
    expect(res.status).toBe(200);
    expect(res.body.deal).toMatchObject({ status: 'COMPLETED', completedAt: NOW.toISOString() });
    const templates = (await db.select().from(emailLog).where(eq(emailLog.dealId, f.deal.id))).map(
      (e) => e.template,
    );
    expect(templates.filter((t) => t === 'FINAL_PAYMENT_DONE')).toHaveLength(2);
    expect(templates.filter((t) => t === 'DEAL_REPORT_READY')).toHaveLength(2);
  });

  it('sends email 5 to both with the payment record attached', async () => {
    const f = await recorded('COMMISSION_PAID');
    await confirmPayment(call, f.creator, f.recordId);
    const mails = await sentEmails('ADVANCE_PAID');
    expect(mails.map((m) => m.toEmail).sort()).toEqual(
      [f.brand.user.email, f.creator.user.email].sort(),
    );
    for (const mail of mails) {
      expect(mail.attachmentNames).toEqual(['VS-PR-2026-27-000001.pdf']);
      expect(mail.bodyText).toContain('ValueSkins did not receive or hold this money');
      expect(mail.bodyText).not.toContain(f.vpa);
    }
  });

  it('only the confirmed creator: never the brand, a stranger or an admin', async () => {
    const f = await recorded('COMMISSION_PAID');
    const stranger = await creatorWithPayout();
    const admin = await adminUser();

    expect((await confirmPayment(call, f.brand, f.recordId)).status).toBe(403);
    expect((await confirmPayment(call, stranger, f.recordId)).status).toBe(404);
    expect((await confirmPayment(call, admin, f.recordId)).status).toBe(403);
    expect(
      (await call.send('post', `/api/direct-payments/${f.recordId}/confirm`, undefined, {})).status,
    ).toBe(401);
    expect((await confirmPayment(call, f.creator, 'nope')).status).toBe(404);
    expect(await statusOf(f.deal.id)).toBe('COMMISSION_PAID');
    expect((await db.select().from(directPayments))[0]?.confirmedAt).toBeNull();
  });

  it('two confirms at once advance the deal once', async () => {
    const f = await recorded('COMMISSION_PAID');
    const results = await Promise.all([
      confirmPayment(call, f.creator, f.recordId),
      confirmPayment(call, f.creator, f.recordId),
      confirmPayment(call, f.creator, f.recordId),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(await statusOf(f.deal.id)).toBe('ADVANCE_PAID');
    expect(await db.select().from(dealEvents).where(eq(dealEvents.dealId, f.deal.id))).toHaveLength(
      1,
    );
    expect(await db.select().from(invoices)).toHaveLength(1);
    expect(await sentEmails('ADVANCE_PAID')).toHaveLength(2);
  });

  it('a second confirm later is a 409 and changes nothing', async () => {
    const f = await recorded('COMMISSION_PAID');
    await confirmPayment(call, f.creator, f.recordId);
    const again = await confirmPayment(call, f.creator, f.recordId);
    expect(again.status).toBe(409);
    expect(await statusOf(f.deal.id)).toBe('ADVANCE_PAID');
  });

  it('a deal an admin cancelled in the meantime cannot be confirmed', async () => {
    const f = await recorded('COMMISSION_PAID');
    const admin = await adminUser();
    await call.send('post', `/api/admin/deals/${f.deal.id}/cancel`, admin.cookie, {
      note: 'Stopped',
    });
    const res = await confirmPayment(call, f.creator, f.recordId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect((await db.select().from(directPayments))[0]?.confirmedAt).toBeNull();
    expect(await db.select().from(invoices)).toHaveLength(0);
  });

  it('rolls the confirmation back when the document cannot be issued', async () => {
    const f = await recorded('COMMISSION_PAID');
    // Without billing details the payment record cannot be built: nothing may be half done.
    const { brandBilling } = await import('../../src/db/schema/index.js');
    await db.delete(brandBilling).where(eq(brandBilling.userId, f.brand.user.id));
    const res = await confirmPayment(call, f.creator, f.recordId);
    expect(res.status).toBe(500);
    expect(await statusOf(f.deal.id)).toBe('COMMISSION_PAID');
    expect((await db.select().from(directPayments))[0]?.confirmedAt).toBeNull();
    expect(await db.select().from(invoices)).toHaveLength(0);
  });
});

describe('POST /api/direct-payments/:id/not-received', () => {
  it('marks the record disputed, leaves the deal alone, emails both and alerts the admin', async () => {
    const f = await dealIn('COMMISSION_PAID');
    const recorded = await recordPayment(call, f.brand, f.deal.id, 'ADVANCE', 'UTR123456789');
    const id = recorded.body.directPayment.id as string;

    const res = await notReceived(call, f.creator, id, 'Nothing in my account');
    expect(res.status).toBe(200);
    expect(res.body.directPayment).toMatchObject({
      status: 'DISPUTED',
      disputedAt: NOW.toISOString(),
      disputeReason: 'Nothing in my account',
    });
    expect(await statusOf(f.deal.id)).toBe('COMMISSION_PAID');
    expect(await db.select().from(dealEvents).where(eq(dealEvents.dealId, f.deal.id))).toHaveLength(
      0,
    );
    // An alert, not a dispute row (REPLACEMENT_PLAN 2.7).
    expect(await db.select().from(disputes)).toHaveLength(0);

    const mails = await sentEmails('DIRECT_PAYMENT_NOT_RECEIVED');
    expect(mails.map((m) => m.toEmail).sort()).toEqual(
      [f.brand.user.email, f.creator.user.email].sort(),
    );
    expect(mails[0]?.bodyText).toContain('Nothing in my account');
    const alerts = await sentEmails('ADMIN_ALERT');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ toEmail: env.DISPUTE_EMAIL });
    expect(alerts[0]?.bodyText).toContain(f.deal.shortId);
    expect(JSON.stringify([...mails, ...alerts])).not.toContain(f.vpa);
  });

  it('the brand can then record again, and the creator confirms the new record', async () => {
    const f = await dealIn('COMMISSION_PAID');
    const first = await recordPayment(call, f.brand, f.deal.id, 'ADVANCE', 'FIRSTREF123');
    await notReceived(call, f.creator, first.body.directPayment.id);

    const second = await recordPayment(call, f.brand, f.deal.id, 'ADVANCE', 'SECONDREF12');
    expect(second.status).toBe(201);
    const rows = await db.select().from(directPayments).where(eq(directPayments.dealId, f.deal.id));
    expect(rows).toHaveLength(2);
    // The disputed row was neither edited nor deleted.
    expect(rows.find((r) => r.id === first.body.directPayment.id)).toMatchObject({
      reference: 'FIRSTREF123',
      disputeReason: 'Nothing arrived',
    });

    expect((await confirmPayment(call, f.creator, second.body.directPayment.id)).status).toBe(200);
    expect(await statusOf(f.deal.id)).toBe('ADVANCE_PAID');
    const shown = (await call.get(`/api/deals/${f.deal.id}`, f.brand.cookie)).body.deal
      .directPayments;
    expect(shown.map((r: { status: string }) => r.status)).toEqual(['DISPUTED', 'CONFIRMED']);
  });

  it('a disputed record cannot be confirmed, and a confirmed one cannot be disputed', async () => {
    const f = await dealIn('COMMISSION_PAID');
    const a = await recordPayment(call, f.brand, f.deal.id, 'ADVANCE', 'FIRSTREF123');
    await notReceived(call, f.creator, a.body.directPayment.id);
    expect((await confirmPayment(call, f.creator, a.body.directPayment.id)).status).toBe(409);
    expect((await notReceived(call, f.creator, a.body.directPayment.id)).status).toBe(409);

    const b = await recordPayment(call, f.brand, f.deal.id, 'ADVANCE', 'SECONDREF12');
    await confirmPayment(call, f.creator, b.body.directPayment.id);
    const late = await notReceived(call, f.creator, b.body.directPayment.id);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('DIRECT_PAYMENT_NOT_PENDING');
    expect(
      (
        await db.select().from(directPayments).where(eq(directPayments.id, b.body.directPayment.id))
      )[0]?.disputedAt,
    ).toBeNull();
  });

  it('needs a reason and the confirmed creator', async () => {
    const f = await dealIn('COMMISSION_PAID');
    const a = await recordPayment(call, f.brand, f.deal.id, 'ADVANCE');
    const id = a.body.directPayment.id as string;
    for (const body of [
      {},
      { reason: '' },
      { reason: '   ' },
      { reason: 'x'.repeat(501) },
      { reason: 'ok', extra: 1 },
    ]) {
      expect(
        (await call.send('post', `/api/direct-payments/${id}/not-received`, f.creator.cookie, body))
          .status,
      ).toBe(400);
    }
    const stranger = await creatorWithPayout();
    expect((await notReceived(call, f.brand, id)).status).toBe(403);
    expect((await notReceived(call, stranger, id)).status).toBe(404);
    expect((await db.select().from(directPayments))[0]?.disputedAt).toBeNull();
  });
});

describe('the deal detail carries the records, masked', () => {
  it('the brand, the creator and an admin see them; everyone else sees none', async () => {
    const f = await dealIn('COMMISSION_PAID');
    await recordPayment(call, f.brand, f.deal.id, 'ADVANCE');
    const admin = await adminUser();
    const stranger = await creatorWithPayout();

    for (const who of [f.brand, f.creator, admin]) {
      const body = (await call.get(`/api/deals/${f.deal.id}`, who.cookie)).body.deal;
      expect(body.directPayments).toHaveLength(1);
      expect(JSON.stringify(body)).not.toContain(f.vpa);
    }
    const seenByStranger = await call.get(`/api/deals/${f.deal.id}`, stranger.cookie);
    expect(seenByStranger.status).toBe(404);
  });
});

describe('the database rules on direct_payments', () => {
  async function insert(values: Partial<typeof directPayments.$inferInsert>) {
    const f = await dealIn('COMMISSION_PAID');
    return db
      .insert(directPayments)
      .values({
        dealId: f.deal.id,
        stage: 'ADVANCE',
        amountPaise: 1,
        reference: 'UTR123456',
        paidToVpa: 'x@ybl',
        recordedBy: f.brand.user.id,
        ...values,
        ...(values.confirmedBy === 'CREATOR' ? { confirmedBy: f.creator.user.id } : {}),
      })
      .then(() => null)
      .catch((error) => (error as { cause?: { code?: string } }).cause?.code ?? 'unknown');
  }

  it('refuses a record that is both confirmed and disputed', async () => {
    expect(
      await insert({
        confirmedBy: 'CREATOR',
        confirmedAt: NOW,
        disputedAt: NOW,
        disputeReason: 'x',
      }),
    ).toBe('23514');
  });

  it('needs confirmed_by exactly when confirmed_at is set', async () => {
    expect(await insert({ confirmedAt: NOW })).toBe('23514');
    expect(await insert({ confirmedBy: 'CREATOR' })).toBe('23514');
  });

  it('needs a dispute reason exactly when disputed_at is set', async () => {
    expect(await insert({ disputedAt: NOW })).toBe('23514');
    expect(await insert({ disputeReason: 'because' })).toBe('23514');
    expect(await insert({ disputedAt: NOW, disputeReason: 'because' })).toBeNull();
  });

  it('allows one live record per deal and stage, and any number of disputed ones', async () => {
    const f = await dealIn('COMMISSION_PAID');
    const row = (reference: string, extra: object = {}) =>
      db
        .insert(directPayments)
        .values({
          dealId: f.deal.id,
          stage: 'ADVANCE',
          amountPaise: 1,
          reference,
          paidToVpa: 'x@ybl',
          recordedBy: f.brand.user.id,
          ...extra,
        })
        .then(() => null)
        .catch((error) => (error as { cause?: { code?: string } }).cause?.code ?? 'unknown');

    expect(await row('LIVEREF0001')).toBeNull();
    expect(await row('LIVEREF0002')).toBe('23505');
    const disputed = { disputedAt: NOW, disputeReason: 'no' };
    expect(await row('DISPUTED001', disputed)).toBeNull();
    expect(await row('DISPUTED002', disputed)).toBeNull();
    // The other stage is independent.
    expect(
      await db
        .insert(directPayments)
        .values({
          dealId: f.deal.id,
          stage: 'FINAL',
          amountPaise: 1,
          reference: 'FINALREF001',
          paidToVpa: 'x@ybl',
          recordedBy: f.brand.user.id,
        })
        .then(() => null),
    ).toBeNull();
  });
});
