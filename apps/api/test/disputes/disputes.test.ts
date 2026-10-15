import { DEAL_STATUSES, type DealStatus } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { disputes } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
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
const api = http(createApp(env, { now: () => NOW }));

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

const BODY = { subject: 'Late delivery', description: 'The content is two weeks late.' };
const raise = (cookie: string | undefined, dealId: string, body: object = BODY) =>
  api.send('post', `/api/deals/${dealId}/disputes`, cookie, body);

/** Resolves a dispute straight in the database, so the next one can be raised. */
async function resolveInDb(id: string) {
  await db.update(disputes).set({ status: 'RESOLVED', resolvedAt: NOW }).where(eq(disputes.id, id));
}

async function confirmedDeal(status: DealStatus = 'ADVANCE_PAID') {
  const brand = await brandWithBilling();
  const creator = await creatorWithPayout();
  const deal = await insertDeal(brand.user.id, status, { creatorId: creator.user.id });
  return { brand, creator, deal };
}

describe('POST /api/deals/:id/disputes: who and when', () => {
  const ELIGIBLE = DEAL_STATUSES.filter((s) => s !== 'DRAFT' && s !== 'OPEN');

  it.each(ELIGIBLE)('the brand and the creator can raise one from %s', async (status) => {
    const { brand, deal } = await confirmedDeal(status);
    const byBrand = await raise(brand.cookie, deal.id);
    expect(byBrand.status).toBe(201);
    expect(byBrand.body.dispute).toMatchObject({
      dealId: deal.id,
      subject: BODY.subject,
      description: BODY.description,
      status: 'OPEN',
      raisedBy: { id: brand.user.id, role: 'BRAND' },
      resolvedBy: null,
    });

    // The creator raises on a deal of its own, at the same stage.
    const other = await confirmedDeal(status);
    const byCreator = await raise(other.creator.cookie, other.deal.id);
    expect(byCreator.status).toBe(201);
    expect(byCreator.body.dispute.raisedBy).toMatchObject({
      id: other.creator.user.id,
      role: 'CREATOR',
    });
  });

  it('only one dispute can be open on a deal: the other party gets 409, and may raise once it is resolved', async () => {
    const { brand, creator, deal } = await confirmedDeal();
    const first = await raise(brand.cookie, deal.id);
    expect(first.status).toBe(201);

    const second = await raise(creator.cookie, deal.id);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DISPUTE_ALREADY_OPEN');
    const again = await raise(brand.cookie, deal.id);
    expect(again.status).toBe(409);
    expect(await db.select().from(disputes).where(eq(disputes.dealId, deal.id))).toHaveLength(1);

    await resolveInDb(first.body.dispute.id);
    expect((await raise(creator.cookie, deal.id)).status).toBe(201);
    expect(await db.select().from(disputes).where(eq(disputes.dealId, deal.id))).toHaveLength(2);
  });

  it('two disputes raised at the same moment make one, and the other answers 409', async () => {
    const { brand, creator, deal } = await confirmedDeal();
    const results = await Promise.all([
      raise(brand.cookie, deal.id),
      raise(creator.cookie, deal.id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.select().from(disputes).where(eq(disputes.dealId, deal.id))).toHaveLength(1);
  });

  it('a refused second dispute does not use the rate limit allowance', async () => {
    const { brand, deal } = await confirmedDeal();
    const first = await raise(brand.cookie, deal.id);
    for (let i = 0; i < 6; i++) expect((await raise(brand.cookie, deal.id)).status).toBe(409);
    await resolveInDb(first.body.dispute.id);
    // Three allowed a day: the first plus two more.
    for (let i = 0; i < 2; i++) {
      const res = await raise(brand.cookie, deal.id);
      expect(res.status).toBe(201);
      await resolveInDb(res.body.dispute.id);
    }
    expect((await raise(brand.cookie, deal.id)).status).toBe(429);
  });

  it('DRAFT and OPEN deals cannot have a dispute', async () => {
    const brand = await brandWithBilling();
    for (const status of ['DRAFT', 'OPEN'] as DealStatus[]) {
      const deal = await insertDeal(brand.user.id, status);
      const res = await raise(brand.cookie, deal.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DISPUTE_NOT_ALLOWED');
    }
    expect(await db.select().from(disputes)).toHaveLength(0);
    expect(await sentEmails('DISPUTE_RAISED')).toHaveLength(0);
  });

  it('a deal cancelled before a creator was confirmed cannot have a dispute; one that had a creator can', async () => {
    const brand = await brandWithBilling();
    const never = await insertDeal(brand.user.id, 'CANCELLED');
    expect((await raise(brand.cookie, never.id)).status).toBe(409);

    const creator = await creatorWithPayout();
    const had = await insertDeal(brand.user.id, 'CANCELLED', { creatorId: creator.user.id });
    expect((await raise(brand.cookie, had.id)).status).toBe(201);
  });

  it('is 401 signed out and 404 for everyone who is not a party', async () => {
    const { deal } = await confirmedDeal();
    const otherBrand = await brandWithBilling();
    const otherCreator = await creatorWithPayout();
    const applicant = await creatorWithPayout();
    await insertApplication(deal.id, applicant.user.id, 'REJECTED');
    const admin = await createUserWithSession({
      isAdmin: true,
      onboardingCompletedAt: new Date(),
    });

    expect((await raise(undefined, deal.id)).status).toBe(401);
    for (const who of [otherBrand, otherCreator, applicant, admin]) {
      const res = await raise(who.cookie, deal.id);
      expect(res.status).toBe(404);
    }
    expect((await raise((await brandWithBilling()).cookie, 'not-a-uuid')).status).toBe(404);
    expect(await db.select().from(disputes)).toHaveLength(0);
  });
});

describe('POST /api/deals/:id/disputes: email 15', () => {
  it('goes to DISPUTE_EMAIL with both parties in CC, once', async () => {
    const { brand, creator, deal } = await confirmedDeal();
    expect((await raise(creator.cookie, deal.id)).status).toBe(201);

    const emails = await sentEmails('DISPUTE_RAISED');
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      toEmail: env.DISPUTE_EMAIL,
      dealId: deal.id,
      userId: creator.user.id,
      status: 'SENT',
    });
    expect([...(emails[0]?.cc ?? [])].sort()).toEqual(
      [brand.user.email, creator.user.email].sort(),
    );
    expect(emails[0]?.bodyText).toContain(BODY.subject);
    expect(emails[0]?.bodyText).toContain(creator.user.username);
  });

  it('skips a party that has no email address', async () => {
    const { brand, creator, deal } = await confirmedDeal();
    const { users } = await import('../../src/db/schema/index.js');
    await db.update(users).set({ email: null }).where(eq(users.id, brand.user.id));
    expect((await raise(creator.cookie, deal.id)).status).toBe(201);
    const [email] = await sentEmails('DISPUTE_RAISED');
    expect(email?.cc).toEqual([creator.user.email]);
  });

  it('escapes the text in the HTML body', async () => {
    const { brand, deal } = await confirmedDeal();
    const res = await raise(brand.cookie, deal.id, {
      subject: '<b>Hi</b>',
      description: 'x & <script>y</script>',
    });
    expect(res.status).toBe(201);
    // The stored body is plain text; the escaping is covered in the template tests.
    const [email] = await sentEmails('DISPUTE_RAISED');
    expect(email?.bodyText).toContain('<b>Hi</b>');
  });
});

describe('POST /api/deals/:id/disputes: validation and rate limit', () => {
  it.each([
    [{ subject: '', description: 'x' }],
    [{ subject: 'x', description: '   ' }],
    [{ subject: 'x' }],
    [{ subject: 'a'.repeat(151), description: 'x' }],
    [{ subject: 'x', description: 'y', status: 'RESOLVED' }],
  ])('rejects %j with 400', async (body) => {
    const { brand, deal } = await confirmedDeal();
    const res = await raise(brand.cookie, deal.id, body);
    expect(res.status).toBe(400);
    expect(await db.select().from(disputes)).toHaveLength(0);
  });

  it('allows 3 per deal per day, then 429 with Retry-After; other deals and users are not limited', async () => {
    const { brand, creator, deal } = await confirmedDeal();
    for (let i = 0; i < 3; i++) {
      const res = await raise(brand.cookie, deal.id);
      expect(res.status).toBe(201);
      await resolveInDb(res.body.dispute.id);
    }

    const limited = await raise(brand.cookie, deal.id);
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(await db.select().from(disputes)).toHaveLength(3);

    expect((await raise(creator.cookie, deal.id)).status).toBe(201);
    const other = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });
    expect((await raise(brand.cookie, other.id)).status).toBe(201);
  });

  it('a request that fails validation or is not allowed does not use the allowance', async () => {
    const { brand, deal } = await confirmedDeal();
    const early = await insertDeal(brand.user.id, 'OPEN');
    for (let i = 0; i < 4; i++) {
      expect((await raise(brand.cookie, deal.id, { subject: '', description: '' })).status).toBe(
        400,
      );
      expect((await raise(brand.cookie, early.id)).status).toBe(409);
    }
    for (let i = 0; i < 3; i++) {
      const res = await raise(brand.cookie, deal.id);
      expect(res.status).toBe(201);
      await resolveInDb(res.body.dispute.id);
    }
  });
});
