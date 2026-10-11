import { DEAL_STATUSES, type DealStatus } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { dealEvents, deals } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http,
  insertDeal,
  sentEmails,
} from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';
import { adminUser } from './helpers.js';

const env = buildTestEnv();
const api = http(createApp(env, { now: () => NOW }));

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

const POST_ADVANCE: DealStatus[] = [
  'ADVANCE_PAID',
  'CONTENT_UPLOADED',
  'REVISION_REQUESTED',
  'APPROVED',
];
/** An admin can cancel from COMMISSION_PAID on (SPEC 5.2); the brand only until then. */
const ADMIN_CANCELLABLE: DealStatus[] = ['COMMISSION_PAID', ...POST_ADVANCE];
const NOTE = 'Creator stopped responding; refunding the brand';

const adminCancel = (cookie: string, dealId: string, body: object = { note: NOTE }) =>
  api.send('post', `/api/admin/deals/${dealId}/cancel`, cookie, body);

async function dealAt(status: DealStatus) {
  const brand = await brandWithBilling();
  const creator = await creatorWithPayout();
  const hasCreator = status !== 'DRAFT' && status !== 'OPEN';
  const deal = await insertDeal(brand.user.id, status, {
    creatorId: hasCreator ? creator.user.id : null,
  });
  return { brand, creator, deal };
}

describe('POST /api/admin/deals/:id/cancel', () => {
  it.each(DEAL_STATUSES)('from %s', async (status) => {
    const admin = await adminUser();
    const { deal } = await dealAt(status);
    const res = await adminCancel(admin.cookie, deal.id);
    const [after] = await db.select().from(deals).where(eq(deals.id, deal.id));

    if (ADMIN_CANCELLABLE.includes(status)) {
      expect(res.status).toBe(200);
      expect(res.body.deal).toMatchObject({
        status: 'CANCELLED',
        cancelledByRole: 'ADMIN',
        cancellationReason: NOTE,
      });
      expect(after).toMatchObject({
        status: 'CANCELLED',
        cancelledById: admin.user.id,
        cancelledByRole: 'ADMIN',
        cancellationReason: NOTE,
      });
      expect(after?.cancelledAt?.toISOString()).toBe(NOW.toISOString());
      return;
    }
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(after?.status).toBe(status);
    expect(await db.select().from(dealEvents).where(eq(dealEvents.dealId, deal.id))).toHaveLength(
      0,
    );
    expect(await sentEmails('DEAL_CANCELLED')).toHaveLength(0);
  });

  it('records the note and the refund reference in the deal event, and emails both parties', async () => {
    const admin = await adminUser();
    const { brand, creator, deal } = await dealAt('CONTENT_UPLOADED');
    const res = await adminCancel(admin.cookie, deal.id, {
      note: NOTE,
      refundReference: 'rfnd_Abc123',
    });
    expect(res.status).toBe(200);

    const [event] = await db.select().from(dealEvents).where(eq(dealEvents.dealId, deal.id));
    expect(event).toMatchObject({
      fromStatus: 'CONTENT_UPLOADED',
      toStatus: 'CANCELLED',
      actorType: 'ADMIN',
      actorId: admin.user.id,
      note: `${NOTE}\nRefund reference: rfnd_Abc123`,
      metadata: { adminCancel: true, refundReference: 'rfnd_Abc123' },
    });

    const mails = await sentEmails('DEAL_CANCELLED');
    expect(mails.map((m) => m.toEmail).sort()).toEqual(
      [brand.user.email, creator.user.email].sort(),
    );
    for (const mail of mails) {
      expect(mail.dealId).toBe(deal.id);
      expect(mail.bodyText).toContain(NOTE);
      expect(mail.bodyText).toContain('The commission already paid was kept.');
    }
  });

  it('needs a note; the refund reference is optional', async () => {
    const admin = await adminUser();
    const { deal } = await dealAt('APPROVED');
    for (const body of [{}, { note: '' }, { note: '  ' }, { note: 'x', refundReference: ' ' }]) {
      expect((await adminCancel(admin.cookie, deal.id, body)).status).toBe(400);
    }
    expect((await db.select().from(deals).where(eq(deals.id, deal.id)))[0]?.status).toBe(
      'APPROVED',
    );
    expect((await adminCancel(admin.cookie, deal.id, { note: 'Just the note' })).status).toBe(200);
    const [event] = await db.select().from(dealEvents).where(eq(dealEvents.dealId, deal.id));
    expect(event?.note).toBe('Just the note');
    expect(event?.metadata).toMatchObject({ refundReference: null });
  });

  it('a second cancel is a 409, and parallel cancels give one winner and one pair of emails', async () => {
    const admin = await adminUser();
    const { deal } = await dealAt('ADVANCE_PAID');
    const results = await Promise.all([
      adminCancel(admin.cookie, deal.id),
      adminCancel(admin.cookie, deal.id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await adminCancel(admin.cookie, deal.id)).status).toBe(409);
    expect(await db.select().from(dealEvents).where(eq(dealEvents.dealId, deal.id))).toHaveLength(
      1,
    );
    expect(await sentEmails('DEAL_CANCELLED')).toHaveLength(2);
  });

  it('is 404 for an unknown deal', async () => {
    const admin = await adminUser();
    expect((await adminCancel(admin.cookie, '0197c0a0-0000-7000-8000-000000000000')).status).toBe(
      404,
    );
  });
});

describe('who can cancel after the advance', () => {
  it.each(POST_ADVANCE)(
    'from %s the brand cannot, the creator cannot, the admin can',
    async (status) => {
      const { brand, creator, deal } = await dealAt(status);
      const admin = await adminUser();

      const byBrand = await api.send('post', `/api/deals/${deal.id}/cancel`, brand.cookie, {
        reason: 'I changed my mind',
      });
      expect(byBrand.status).toBe(409);
      expect(byBrand.body.error.code).toBe('CANCELLATION_NOT_POSSIBLE');

      const byCreator = await api.send('post', `/api/deals/${deal.id}/cancel`, creator.cookie, {
        reason: 'x',
      });
      expect([403, 404]).toContain(byCreator.status);
      expect((await db.select().from(deals).where(eq(deals.id, deal.id)))[0]?.status).toBe(status);

      expect((await adminCancel(admin.cookie, deal.id)).status).toBe(200);
    },
  );

  it('a brand using the admin route gets 404 and nothing changes', async () => {
    const { brand, deal } = await dealAt('ADVANCE_PAID');
    const res = await adminCancel(brand.cookie, deal.id);
    expect(res.status).toBe(404);
    expect((await db.select().from(deals).where(eq(deals.id, deal.id)))[0]?.status).toBe(
      'ADVANCE_PAID',
    );
  });
});
