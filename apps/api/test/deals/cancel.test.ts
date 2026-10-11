import { DEAL_STATUSES, type DealStatus } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { applications, dealEvents, deals } from '../../src/db/schema/index.js';
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

const env = buildTestEnv();
const api = http(createApp(env, { now: () => NOW }));

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

const REASON = 'Plans changed';

const ALLOWED: DealStatus[] = ['OPEN', 'CONFIRMED'];
// From the moment the fee is paid only an admin can cancel (REPLACEMENT_PLAN 2.6).
const AFTER_FEE: DealStatus[] = [
  'COMMISSION_PAID',
  'ADVANCE_PAID',
  'CONTENT_UPLOADED',
  'REVISION_REQUESTED',
  'APPROVED',
];

describe('POST /api/deals/:id/cancel', () => {
  it.each(DEAL_STATUSES)('from %s', async (status) => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const hasCreator = status !== 'DRAFT' && status !== 'OPEN';
    const deal = await insertDeal(brand.user.id, status, {
      creatorId: hasCreator ? creator.user.id : null,
    });

    const res = await api.send('post', `/api/deals/${deal.id}/cancel`, brand.cookie, {
      reason: REASON,
    });
    const [after] = await db.select().from(deals).where(eq(deals.id, deal.id));

    if (ALLOWED.includes(status)) {
      expect(res.status).toBe(200);
      expect(res.body.deal).toMatchObject({
        status: 'CANCELLED',
        cancelledByRole: 'BRAND',
        cancellationReason: REASON,
      });
      expect(after).toMatchObject({
        status: 'CANCELLED',
        cancelledById: brand.user.id,
        cancelledByRole: 'BRAND',
        cancellationReason: REASON,
      });
      expect(after?.cancelledAt?.toISOString()).toBe(NOW.toISOString());
      const events = await db.select().from(dealEvents).where(eq(dealEvents.dealId, deal.id));
      expect(events).toMatchObject([{ fromStatus: status, toStatus: 'CANCELLED', note: REASON }]);
      return;
    }

    expect(res.status).toBe(409);
    expect(after?.status).toBe(status);
    expect(await db.select().from(dealEvents).where(eq(dealEvents.dealId, deal.id))).toHaveLength(
      0,
    );
    expect(await sentEmails('DEAL_CANCELLED')).toHaveLength(0);
    if (AFTER_FEE.includes(status)) {
      expect(res.body.error).toMatchObject({
        code: 'CANCELLATION_NOT_POSSIBLE',
        message:
          'The deal cannot be cancelled after the fee is paid. Write to us if something is wrong.',
      });
    } else {
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
    }
  });

  it('emails only the brand when an OPEN deal is cancelled (applicants are not emailed)', async () => {
    const brand = await brandWithBilling();
    const applicant = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    await db.insert(applications).values({
      dealId: deal.id,
      creatorId: applicant.user.id,
    });

    await api.send('post', `/api/deals/${deal.id}/cancel`, brand.cookie, { reason: REASON });

    const emails = await sentEmails('DEAL_CANCELLED');
    expect(emails.map((e) => e.toEmail)).toEqual([brand.user.email]);
    expect(emails[0]?.bodyText).toContain(REASON);
    expect(emails[0]?.bodyText).toContain('No fee was charged');
  });

  it('emails the brand and the confirmed creator from CONFIRMED', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'CONFIRMED', { creatorId: creator.user.id });

    await api.send('post', `/api/deals/${deal.id}/cancel`, brand.cookie, { reason: REASON });

    const emails = await sentEmails('DEAL_CANCELLED');
    expect(emails.map((e) => e.toEmail).sort()).toEqual(
      [brand.user.email, creator.user.email].sort(),
    );
    for (const email of emails) {
      expect(email.dealId).toBe(deal.id);
      expect(email.bodyText).toContain('No fee was charged');
      expect(email.bodyText).toContain(env.SUPPORT_EMAIL);
    }
  });

  it('requires a reason', async () => {
    const brand = await brandWithBilling();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    for (const body of [{}, { reason: '' }]) {
      const res = await api.send('post', `/api/deals/${deal.id}/cancel`, brand.cookie, body);
      expect(res.status).toBe(400);
    }
    const [after] = await db.select().from(deals).where(eq(deals.id, deal.id));
    expect(after?.status).toBe('OPEN');
  });

  it("is a 404 for another brand's deal", async () => {
    const owner = await brandWithBilling();
    const other = await brandWithBilling();
    const deal = await insertDeal(owner.user.id, 'OPEN');
    const res = await api.send('post', `/api/deals/${deal.id}/cancel`, other.cookie, {
      reason: REASON,
    });
    expect(res.status).toBe(404);
    const [after] = await db.select().from(deals).where(eq(deals.id, deal.id));
    expect(after?.status).toBe('OPEN');
  });

  it('lets exactly one of two parallel cancels win', async () => {
    const brand = await brandWithBilling();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    const [a, b] = await Promise.all([
      api.send('post', `/api/deals/${deal.id}/cancel`, brand.cookie, { reason: 'first' }),
      api.send('post', `/api/deals/${deal.id}/cancel`, brand.cookie, { reason: 'second' }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error.code).toBe('INVALID_TRANSITION');
    expect(await db.select().from(dealEvents).where(eq(dealEvents.dealId, deal.id))).toHaveLength(
      1,
    );
    expect(await sentEmails('DEAL_CANCELLED')).toHaveLength(1);
  });
});
