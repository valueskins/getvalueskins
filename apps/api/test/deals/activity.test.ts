import { dealEventListResponseSchema } from '@valueskins/shared';
import { eq, sql } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { dealEvents, directPayments, users } from '../../src/db/schema/index.js';
import { DELETED_USER_NAME } from '../../src/deals/dealView.js';
import { adminUser } from '../admin/helpers.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, brandWithBilling, creatorWithPayout, http, insertDeal } from '../helpers/deals.js';
import { runDeal } from '../helpers/lifecycle.js';
import { confirmPayment, notReceived, recordPayment } from '../payments/fixture.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';
import { buildTestEnv } from '../testEnv.js';

const call = http(
  createApp(buildTestEnv(), {
    now: () => NOW,
    razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} },
  }),
);
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

async function events(cookie: string, dealId: string) {
  const res = await call.get(`/api/deals/${dealId}/events`, cookie);
  expect(res.status).toBe(200);
  return dealEventListResponseSchema.parse(res.body).items;
}

/** Makes the next insert of a deal event of this kind fail, to prove the change shares its transaction. */
async function failEventsOfKind(kind: string): Promise<() => Promise<void>> {
  await db.execute(
    sql.raw(`
    CREATE OR REPLACE FUNCTION fail_deal_event() RETURNS trigger AS $$
    BEGIN
      IF NEW.metadata->>'kind' = '${kind}' THEN RAISE EXCEPTION 'deal event refused'; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`),
  );
  await db.execute(
    sql.raw(`CREATE TRIGGER fail_deal_event BEFORE INSERT ON deal_events
      FOR EACH ROW EXECUTE FUNCTION fail_deal_event()`),
  );
  return async () => {
    await db.execute(sql.raw('DROP TRIGGER IF EXISTS fail_deal_event ON deal_events'));
    await db.execute(sql.raw('DROP FUNCTION IF EXISTS fail_deal_event()'));
  };
}

describe('GET /api/deals/:id/events: actor role and kind', () => {
  it('every event says who acted by role, and what kind of event it is', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'COMPLETED');
    const items = await events(brand.cookie, deal.id);

    expect(items.length).toBeGreaterThan(5);
    for (const item of items) {
      expect(item.actor.role).not.toBeNull();
      expect(['BRAND', 'CREATOR', 'ADMIN', 'SYSTEM']).toContain(item.actor.role);
    }
    const byKind = (kind: string) => items.filter((i) => i.kind === kind);
    expect(byKind('PAYMENT_RECORDED').map((i) => i.actor.role)).toEqual(['BRAND', 'BRAND']);
    expect(byKind('TRANSITION').some((i) => i.actor.role === 'CREATOR')).toBe(true);
    expect(byKind('TRANSITION').some((i) => i.actor.role === 'BRAND')).toBe(true);
    // The creator sees the same history as the brand.
    expect(await events(creator.cookie, deal.id)).toEqual(items);
  });

  it('a stranger, another brand and an unconfirmed creator get 404', async () => {
    const { deal } = await runDeal(call, razorpay, 'ADVANCE_PAID');
    for (const who of [await creatorWithPayout(), await brandWithBilling()]) {
      expect((await call.get(`/api/deals/${deal.id}/events`, who.cookie)).status).toBe(404);
    }
    expect((await call.get(`/api/deals/${deal.id}/events`)).status).toBe(401);
  });

  it('an admin cancel is an ADMIN event, and a system event is SYSTEM', async () => {
    const { brand, deal } = await runDeal(call, razorpay, 'ADVANCE_PAID');
    const admin = await adminUser();
    expect(
      (
        await call.send('post', `/api/admin/deals/${deal.id}/cancel`, admin.cookie, {
          note: 'Creator stopped responding',
        })
      ).status,
    ).toBe(200);
    await db.insert(dealEvents).values({
      dealId: deal.id,
      fromStatus: 'CANCELLED',
      toStatus: 'CANCELLED',
      actorType: 'SYSTEM',
      note: 'Checked by a job',
    });
    const items = await events(brand.cookie, deal.id);
    expect(items.at(-2)?.actor).toMatchObject({ type: 'ADMIN', role: 'ADMIN' });
    expect(items.at(-1)?.actor).toEqual({ type: 'SYSTEM', role: 'SYSTEM', username: null });
  });

  it('a deleted actor is "Deleted user", never the anonymized username', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'ADVANCE_PAID');
    await db
      .update(users)
      .set({ username: 'deleted_ab12cd34', deletedAt: NOW })
      .where(eq(users.id, creator.user.id));
    const items = await events(brand.cookie, deal.id);
    const text = JSON.stringify(items);
    expect(text).not.toContain('deleted_ab12cd34');
    expect(
      items
        .filter((i) => i.actor.role === 'CREATOR')
        .every((i) => i.actor.username === DELETED_USER_NAME),
    ).toBe(true);
    expect(items.some((i) => i.actor.role === 'CREATOR')).toBe(true);
  });
});

describe('recorded and not-received payments are events', () => {
  it('a record writes one PAYMENT_RECORDED event, with the status unchanged and no UPI ID or reference', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'COMMISSION_PAID');
    const before = await events(brand.cookie, deal.id);
    const res = await recordPayment(call, brand, deal.id, 'ADVANCE', 'UTRSECRET99999');
    expect(res.status).toBe(201);

    const after = await events(creator.cookie, deal.id);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toMatchObject({
      kind: 'PAYMENT_RECORDED',
      fromStatus: 'COMMISSION_PAID',
      toStatus: 'COMMISSION_PAID',
      actor: { type: 'USER', role: 'BRAND' },
      note: null,
      refundReference: null,
    });
    const rows = await db.select().from(dealEvents).where(eq(dealEvents.dealId, deal.id));
    const text = JSON.stringify(rows);
    expect(text).not.toContain('UTRSECRET99999');
    expect(text).not.toMatch(/@/);
  });

  it('not-received writes a PAYMENT_NOT_RECEIVED event by the creator, with their reason as the note', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'COMMISSION_PAID');
    const recorded = await recordPayment(call, brand, deal.id, 'ADVANCE');
    const res = await notReceived(call, creator, recorded.body.directPayment.id, 'Nothing arrived');
    expect(res.status).toBe(200);

    const last = (await events(brand.cookie, deal.id)).at(-1);
    expect(last).toMatchObject({
      kind: 'PAYMENT_NOT_RECEIVED',
      fromStatus: 'COMMISSION_PAID',
      toStatus: 'COMMISSION_PAID',
      actor: { type: 'USER', role: 'CREATOR' },
      note: 'Nothing arrived',
    });
  });

  it('confirming moves the deal and adds a normal transition after the record event', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'COMMISSION_PAID');
    const recorded = await recordPayment(call, brand, deal.id, 'ADVANCE');
    expect((await confirmPayment(call, creator, recorded.body.directPayment.id)).status).toBe(200);
    const tail = (await events(brand.cookie, deal.id)).slice(-2);
    expect(tail.map((i) => `${i.kind}:${i.fromStatus}>${i.toStatus}`)).toEqual([
      'PAYMENT_RECORDED:COMMISSION_PAID>COMMISSION_PAID',
      'TRANSITION:COMMISSION_PAID>ADVANCE_PAID',
    ]);
  });

  it('a record whose event cannot be written leaves no record (same transaction)', async () => {
    const { brand, deal } = await runDeal(call, razorpay, 'COMMISSION_PAID');
    const undo = await failEventsOfKind('PAYMENT_RECORDED');
    try {
      const res = await recordPayment(call, brand, deal.id, 'ADVANCE');
      expect(res.status).toBe(500);
    } finally {
      await undo();
    }
    expect(
      await db.select().from(directPayments).where(eq(directPayments.dealId, deal.id)),
    ).toEqual([]);
    const kinds = (await events(brand.cookie, deal.id)).map((i) => i.kind);
    expect(kinds).not.toContain('PAYMENT_RECORDED');
    // The brand can record again once the fault is gone.
    expect((await recordPayment(call, brand, deal.id, 'ADVANCE')).status).toBe(201);
  });

  it('a not-received whose event cannot be written leaves the record awaiting confirmation', async () => {
    const { brand, creator, deal } = await runDeal(call, razorpay, 'COMMISSION_PAID');
    const recorded = await recordPayment(call, brand, deal.id, 'ADVANCE');
    const id = recorded.body.directPayment.id as string;
    const undo = await failEventsOfKind('PAYMENT_NOT_RECEIVED');
    try {
      expect((await notReceived(call, creator, id)).status).toBe(500);
    } finally {
      await undo();
    }
    const [row] = await db.select().from(directPayments).where(eq(directPayments.id, id));
    expect(row?.confirmedAt ?? null).toBeNull();
    expect(row?.disputedAt ?? null).toBeNull();
    expect((await events(brand.cookie, deal.id)).map((i) => i.kind)).not.toContain(
      'PAYMENT_NOT_RECEIVED',
    );
    expect((await notReceived(call, creator, id)).status).toBe(200);
  });

  it('a refused record (no UPI ID, wrong status) writes no event', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'CONFIRMED', { creatorId: creator.user.id });
    expect((await recordPayment(call, brand, deal.id, 'ADVANCE')).status).toBe(409);
    expect(await db.select().from(dealEvents).where(eq(dealEvents.dealId, deal.id))).toEqual([]);
  });
});

describe('admin cancel refund reference', () => {
  it('is a field on the event and not text in the note', async () => {
    const { brand, deal } = await runDeal(call, razorpay, 'ADVANCE_PAID');
    const admin = await adminUser();
    const res = await call.send('post', `/api/admin/deals/${deal.id}/cancel`, admin.cookie, {
      note: 'Creator stopped responding',
      refundReference: 'rfnd_ABC123',
    });
    expect(res.status).toBe(200);

    const last = (await events(brand.cookie, deal.id)).at(-1);
    expect(last).toMatchObject({
      kind: 'TRANSITION',
      toStatus: 'CANCELLED',
      note: 'Creator stopped responding',
      refundReference: 'rfnd_ABC123',
    });
    expect(last?.note).not.toContain('rfnd_ABC123');

    // The admin detail shows the same event shape.
    const detail = await call.get(`/api/admin/deals/${deal.id}`, admin.cookie);
    const cancelEvent = detail.body.events.at(-1);
    expect(cancelEvent).toMatchObject({ refundReference: 'rfnd_ABC123', actor: { role: 'ADMIN' } });
  });

  it('is null when no reference was given', async () => {
    const { brand, deal } = await runDeal(call, razorpay, 'ADVANCE_PAID');
    const admin = await adminUser();
    await call.send('post', `/api/admin/deals/${deal.id}/cancel`, admin.cookie, {
      note: 'Creator stopped responding',
    });
    expect((await events(brand.cookie, deal.id)).at(-1)?.refundReference).toBeNull();
  });
});
