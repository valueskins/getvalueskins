import {
  APPLICANT_HAS_NO_UPI,
  APPLICANT_NO_LONGER_AVAILABLE,
  APPLICATION_ALREADY_DECIDED,
  CREATOR_HAS_NO_UPI,
  CREATOR_NOT_AGREED_TO_SHARE_UPI,
  DEAL_NO_LONGER_OPEN,
  dealApplicationListResponseSchema,
} from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http,
  insertApplication,
  insertDeal,
} from '../helpers/deals.js';
import { recordPayment } from '../payments/fixture.js';
import { buildTestEnv } from '../testEnv.js';

const api = http(createApp(buildTestEnv(), { now: () => NOW }));

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

/** Changes a user's columns; a no-op for an empty change (Drizzle refuses an empty update). */
async function setUser(userId: string, values: Partial<typeof users.$inferInsert>) {
  if (Object.keys(values).length > 0)
    await db.update(users).set(values).where(eq(users.id, userId));
}

/** An OPEN deal with one applicant whose payout details are changed by `change`. */
async function applicant(
  changes: Partial<typeof users.$inferInsert> = {},
  application: 'APPLIED' | 'CONFIRMED' | 'REJECTED' = 'APPLIED',
  dealStatus: 'OPEN' | 'CANCELLED' = 'OPEN',
) {
  const brand = await brandWithBilling();
  const creator = await creatorWithPayout();
  await setUser(creator.user.id, changes);
  const deal = await insertDeal(brand.user.id, dealStatus);
  const row = await insertApplication(deal.id, creator.user.id, application);
  return { brand, creator, deal, application: row };
}

async function confirmFor(f: Awaited<ReturnType<typeof applicant>>) {
  const res = await api.get(`/api/deals/${f.deal.id}/applications`, f.brand.cookie);
  expect(res.status).toBe(200);
  return dealApplicationListResponseSchema.parse(res.body).items[0]!.confirm;
}

describe('the confirm state of each applicant (SPEC 5.5)', () => {
  it('is enabled, with no reason, for a creator who can be paid', async () => {
    expect(await confirmFor(await applicant())).toEqual({ enabled: true, reason: null });
  });

  it('says "has not added a UPI ID" when the UPI ID or the name is missing', async () => {
    for (const change of [{ payoutVpa: null }, { payoutName: null }]) {
      expect(await confirmFor(await applicant(change))).toEqual({
        enabled: false,
        reason: 'This creator has not added a UPI ID',
      });
    }
    expect(APPLICANT_HAS_NO_UPI).toBe('This creator has not added a UPI ID');
  });

  it('says "has not agreed to share" when the UPI ID is saved without consent', async () => {
    expect(await confirmFor(await applicant({ payoutVpaConsentAt: null }))).toEqual({
      enabled: false,
      reason: 'The creator has not agreed to share their UPI ID',
    });
    expect(CREATOR_NOT_AGREED_TO_SHARE_UPI).toBe(
      'The creator has not agreed to share their UPI ID',
    );
  });

  it('says the creator is no longer available for a deleted account, before anything else', async () => {
    const f = await applicant({ deletedAt: NOW, payoutVpa: null, payoutVpaConsentAt: null });
    expect(await confirmFor(f)).toEqual({ enabled: false, reason: APPLICANT_NO_LONGER_AVAILABLE });
  });

  it('says the application was already decided when it is not pending', async () => {
    for (const status of ['CONFIRMED', 'REJECTED'] as const) {
      expect(await confirmFor(await applicant({}, status))).toEqual({
        enabled: false,
        reason: APPLICATION_ALREADY_DECIDED,
      });
    }
  });

  it('says the deal is no longer open when it is not OPEN', async () => {
    expect(await confirmFor(await applicant({}, 'APPLIED', 'CANCELLED'))).toEqual({
      enabled: false,
      reason: DEAL_NO_LONGER_OPEN,
    });
  });

  it('gives each applicant of a page their own state', async () => {
    const brand = await brandWithBilling();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    const ready = await creatorWithPayout();
    const noUpi = await creatorWithPayout(null);
    const noConsent = await creatorWithPayout('ACTIVE', { payoutVpaConsentAt: null });
    for (const c of [ready, noUpi, noConsent]) await insertApplication(deal.id, c.user.id);

    const res = await api.get(`/api/deals/${deal.id}/applications`, brand.cookie);
    const states = Object.fromEntries(
      dealApplicationListResponseSchema
        .parse(res.body)
        .items.map((i) => [i.creator.id, i.confirm.reason]),
    );
    expect(states).toEqual({
      [ready.user.id]: null,
      [noUpi.user.id]: APPLICANT_HAS_NO_UPI,
      [noConsent.user.id]: CREATOR_NOT_AGREED_TO_SHARE_UPI,
    });
  });

  it('never carries a UPI ID, and only the deal brand can read the list', async () => {
    const f = await applicant();
    const res = await api.get(`/api/deals/${f.deal.id}/applications`, f.brand.cookie);
    expect(JSON.stringify(res.body)).not.toMatch(/okaxis|@[a-z]+\b.*payout/i);
    const other = await brandWithBilling();
    expect((await api.get(`/api/deals/${f.deal.id}/applications`, other.cookie)).status).toBe(404);
    expect((await api.get(`/api/deals/${f.deal.id}/applications`, f.creator.cookie)).status).toBe(
      403,
    );
  });
});

describe('the confirm itself gives the same reasons', () => {
  it.each([
    ['no UPI ID', { payoutVpa: null }, APPLICANT_HAS_NO_UPI],
    ['no consent', { payoutVpaConsentAt: null }, CREATOR_NOT_AGREED_TO_SHARE_UPI],
    ['a deleted account', { deletedAt: NOW }, APPLICANT_NO_LONGER_AVAILABLE],
  ])('refuses an applicant with %s with that reason', async (_label, change, reason) => {
    const f = await applicant(change);
    const res = await api.send(
      'post',
      `/api/applications/${f.application.id}/confirm`,
      f.brand.cookie,
      {},
    );
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe(reason);
  });
});

describe('PAY_ADVANCE and PAY_FINAL say which reason applies', () => {
  async function dealWith(
    changes: Partial<typeof users.$inferInsert>,
    status: 'COMMISSION_PAID' | 'APPROVED',
  ) {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    await setUser(creator.user.id, changes);
    const deal = await insertDeal(brand.user.id, status, { creatorId: creator.user.id });
    return { brand, creator, deal };
  }
  const action = async (f: Awaited<ReturnType<typeof dealWith>>, name: string) =>
    (await api.get(`/api/deals/${f.deal.id}`, f.brand.cookie)).body.deal.allowedActions.find(
      (a: { action: string }) => a.action === name,
    );

  it.each([
    ['COMMISSION_PAID', 'PAY_ADVANCE'],
    ['APPROVED', 'PAY_FINAL'],
  ] as const)('%s: %s', async (status, name) => {
    const noUpi = await dealWith({ payoutVpa: null }, status);
    expect(await action(noUpi, name)).toEqual({
      action: name,
      enabled: false,
      reason: CREATOR_HAS_NO_UPI,
    });

    const noConsent = await dealWith({ payoutVpaConsentAt: null }, status);
    expect(await action(noConsent, name)).toEqual({
      action: name,
      enabled: false,
      reason: CREATOR_NOT_AGREED_TO_SHARE_UPI,
    });

    const ready = await dealWith({}, status);
    expect(await action(ready, name)).toMatchObject({ enabled: true, reason: null });
  });

  it('the creator never sees the payout reason, and the detail keeps creatorPayoutSet for the brand', async () => {
    const f = await dealWith({ payoutVpaConsentAt: null }, 'COMMISSION_PAID');
    const asBrand = await api.get(`/api/deals/${f.deal.id}`, f.brand.cookie);
    expect(asBrand.body.deal.creatorPayoutSet).toBe(false);
    const asCreator = await api.get(`/api/deals/${f.deal.id}`, f.creator.cookie);
    expect(asCreator.body.deal.creatorPayoutSet).toBeNull();
    expect(JSON.stringify(asCreator.body.deal.allowedActions)).not.toContain('agreed');
  });
});

describe('recording a payment for a creator who cannot be paid', () => {
  it.each([
    ['no UPI ID', { payoutVpa: null }, CREATOR_HAS_NO_UPI],
    ['no consent', { payoutVpaConsentAt: null }, CREATOR_NOT_AGREED_TO_SHARE_UPI],
  ])(
    'answers 409 with the reason for %s, not a message about confirming a creator',
    async (_label, change, reason) => {
      const brand = await brandWithBilling();
      const creator = await creatorWithPayout();
      await db.update(users).set(change).where(eq(users.id, creator.user.id));
      const deal = await insertDeal(brand.user.id, 'COMMISSION_PAID', {
        creatorId: creator.user.id,
      });

      const res = await recordPayment(api, brand, deal.id, 'ADVANCE');

      expect(res.status).toBe(409);
      expect(res.body.error).toEqual({ code: 'CREATOR_PAYOUT_NOT_SET', message: reason });
      expect(res.body.error.message).not.toContain('confirmed');
    },
  );
});
