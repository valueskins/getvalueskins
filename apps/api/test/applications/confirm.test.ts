import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import {
  applications,
  creatorPayoutAccounts,
  dealEvents,
  deals,
  users,
} from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http,
  insertApplication,
  insertDeal,
  sentEmails,
} from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();
let clock = NOW;
const api = http(createApp(env, { now: () => clock }));

beforeAll(resetDb);
beforeEach(async () => {
  clock = NOW;
  await truncateAll();
});
afterAll(closeDb);

const confirm = (cookie: string, applicationId: string) =>
  api.send('post', `/api/applications/${applicationId}/confirm`, cookie, {});

async function openDealWithApplicants(count: number) {
  const brand = await brandWithBilling();
  const deal = await insertDeal(brand.user.id, 'OPEN');
  const creators = [];
  const apps = [];
  for (let i = 0; i < count; i++) {
    const creator = await creatorWithPayout();
    creators.push(creator);
    apps.push(await insertApplication(deal.id, creator.user.id));
  }
  return { brand, deal, creators, apps };
}

async function snapshot(dealId: string) {
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  const apps = await db.select().from(applications).where(eq(applications.dealId, dealId));
  const events = await db.select().from(dealEvents).where(eq(dealEvents.dealId, dealId));
  return { deal, apps, events };
}

describe('POST /api/applications/:id/confirm', () => {
  it('confirms one applicant, rejects the rest and moves the deal to CONFIRMED', async () => {
    const { brand, deal, creators, apps } = await openDealWithApplicants(3);

    const res = await confirm(brand.cookie, apps[1]!.id);
    expect(res.status).toBe(200);
    expect(res.body.deal).toMatchObject({
      id: deal.id,
      status: 'CONFIRMED',
      creator: { id: creators[1]!.user.id },
      creatorPayoutStatus: 'ACTIVE',
      applicationCount: 3,
    });
    expect(res.body.deal.allowedActions).toEqual([
      { action: 'PAY_COMMISSION', enabled: true, reason: null },
      { action: 'CANCEL', enabled: true, reason: null },
    ]);

    const after = await snapshot(deal.id);
    expect(after.deal).toMatchObject({ status: 'CONFIRMED', creatorId: creators[1]!.user.id });
    expect(after.deal?.confirmedAt?.toISOString()).toBe(NOW.toISOString());
    const byCreator = Object.fromEntries(after.apps.map((a) => [a.creatorId, a.status]));
    expect(byCreator).toEqual({
      [creators[0]!.user.id]: 'REJECTED',
      [creators[1]!.user.id]: 'CONFIRMED',
      [creators[2]!.user.id]: 'REJECTED',
    });
    expect(after.events).toMatchObject([
      { fromStatus: 'OPEN', toStatus: 'CONFIRMED', actorId: brand.user.id },
    ]);
  });

  it('sends email 3 to the chosen creator and 3b to each other applicant', async () => {
    const { brand, deal, creators, apps } = await openDealWithApplicants(3);
    await confirm(brand.cookie, apps[0]!.id);

    const selected = await sentEmails('YOU_WERE_SELECTED');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ toEmail: creators[0]!.user.email, dealId: deal.id });
    expect(selected[0]?.bodyText).toContain(brand.user.username);

    const rejected = await sentEmails('APPLICATION_NOT_SELECTED');
    expect(rejected.map((e) => e.toEmail).sort()).toEqual(
      [creators[1]!.user.email, creators[2]!.user.email].sort(),
    );
  });

  it('still works after the application deadline has passed', async () => {
    const { brand, apps } = await openDealWithApplicants(1);
    clock = new Date('2026-10-20T00:00:00Z');
    expect((await confirm(brand.cookie, apps[0]!.id)).status).toBe(200);
  });

  it('refuses a creator whose payout account is no longer ACTIVE, and changes nothing', async () => {
    const { brand, deal, creators, apps } = await openDealWithApplicants(2);
    await db
      .update(creatorPayoutAccounts)
      .set({ status: 'SUSPENDED' })
      .where(eq(creatorPayoutAccounts.userId, creators[0]!.user.id));

    const res = await confirm(brand.cookie, apps[0]!.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CREATOR_PAYOUT_NOT_ACTIVE');

    const after = await snapshot(deal.id);
    expect(after.deal).toMatchObject({ status: 'OPEN', creatorId: null });
    expect(after.apps.every((a) => a.status === 'APPLIED')).toBe(true);
    expect(after.events).toHaveLength(0);
    expect(await sentEmails()).toHaveLength(0);
  });

  it('refuses a creator who deleted their account', async () => {
    const { brand, deal, creators, apps } = await openDealWithApplicants(1);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, creators[0]!.user.id));
    const res = await confirm(brand.cookie, apps[0]!.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPLICANT_UNAVAILABLE');
    expect((await snapshot(deal.id)).deal?.status).toBe('OPEN');
  });

  it('is all or nothing: a failure while rejecting the others undoes the confirmation', async () => {
    const { brand, deal, apps } = await openDealWithApplicants(2);
    await db.execute(sql`
      CREATE FUNCTION fail_on_reject() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected failure'; END;
      $$ LANGUAGE plpgsql`);
    await db.execute(sql`
      CREATE TRIGGER fail_on_reject BEFORE UPDATE ON applications
      FOR EACH ROW WHEN (NEW.status = 'REJECTED') EXECUTE FUNCTION fail_on_reject()`);
    try {
      const res = await confirm(brand.cookie, apps[0]!.id);
      expect(res.status).toBe(500);
    } finally {
      await db.execute(sql`DROP TRIGGER fail_on_reject ON applications`);
      await db.execute(sql`DROP FUNCTION fail_on_reject()`);
    }

    const after = await snapshot(deal.id);
    expect(after.deal).toMatchObject({ status: 'OPEN', creatorId: null, confirmedAt: null });
    expect(after.apps.map((a) => a.status)).toEqual(['APPLIED', 'APPLIED']);
    expect(after.events).toHaveLength(0);
    expect(await sentEmails()).toHaveLength(0);
  });

  describe('parallel confirms', () => {
    it('lets only one of two confirms of different applicants win', async () => {
      const { brand, deal, apps } = await openDealWithApplicants(2);
      const [a, b] = await Promise.all([
        confirm(brand.cookie, apps[0]!.id),
        confirm(brand.cookie, apps[1]!.id),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const loser = a.status === 409 ? a : b;
      expect(['INVALID_TRANSITION', 'APPLICATION_NOT_PENDING']).toContain(loser.body.error.code);

      const after = await snapshot(deal.id);
      expect(after.deal?.status).toBe('CONFIRMED');
      expect(after.apps.filter((x) => x.status === 'CONFIRMED')).toHaveLength(1);
      expect(after.apps.filter((x) => x.status === 'REJECTED')).toHaveLength(1);
      expect(after.deal?.creatorId).toBe(
        after.apps.find((x) => x.status === 'CONFIRMED')?.creatorId,
      );
      expect(after.events).toHaveLength(1);
      expect(await sentEmails('YOU_WERE_SELECTED')).toHaveLength(1);
      expect(await sentEmails('APPLICATION_NOT_SELECTED')).toHaveLength(1);
    });

    it('lets only one of two confirms of the same applicant win', async () => {
      const { brand, deal, apps } = await openDealWithApplicants(1);
      const [a, b] = await Promise.all([
        confirm(brand.cookie, apps[0]!.id),
        confirm(brand.cookie, apps[0]!.id),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect((await snapshot(deal.id)).events).toHaveLength(1);
      expect(await sentEmails('YOU_WERE_SELECTED')).toHaveLength(1);
    });
  });

  it('refuses an application that was already decided', async () => {
    const { brand, apps } = await openDealWithApplicants(2);
    await confirm(brand.cookie, apps[0]!.id);
    const res = await confirm(brand.cookie, apps[1]!.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPLICATION_NOT_PENDING');
  });

  it('refuses when the deal is no longer OPEN', async () => {
    const { brand, deal, apps } = await openDealWithApplicants(1);
    await api.send('post', `/api/deals/${deal.id}/cancel`, brand.cookie, { reason: 'changed' });
    const res = await confirm(brand.cookie, apps[0]!.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect((await snapshot(deal.id)).apps[0]?.status).toBe('APPLIED');
  });

  it("is a 404 for another brand, a creator's own application, and unknown ids", async () => {
    const { deal, apps, creators } = await openDealWithApplicants(1);
    const otherBrand = await brandWithBilling();
    expect((await confirm(otherBrand.cookie, apps[0]!.id)).status).toBe(404);
    expect((await confirm(creators[0]!.cookie, apps[0]!.id)).status).toBe(403);
    expect((await confirm(otherBrand.cookie, '01a11f37-1217-712d-962d-13a5004bd584')).status).toBe(
      404,
    );
    expect((await snapshot(deal.id)).deal?.status).toBe('OPEN');
  });
});
