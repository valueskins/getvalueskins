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
  insertDeal,
  sentEmails,
} from '../helpers/deals.js';
import { notReceived, recordPayment } from '../payments/fixture.js';
import { buildTestEnv } from '../testEnv.js';
import { adminUser } from './helpers.js';

const env = buildTestEnv();
const api = http(createApp(env, { now: () => NOW }));

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

const raise = (cookie: string, dealId: string, subject = 'Late delivery') =>
  api.send('post', `/api/deals/${dealId}/disputes`, cookie, { subject, description: 'Details' });

async function listItem(adminCookie: string, dealId: string) {
  const res = await api.get('/api/admin/deals?limit=50', adminCookie);
  expect(res.status).toBe(200);
  return (res.body.items as Array<Record<string, unknown>>).find((d) => d.id === dealId)!;
}

describe('GET /api/admin/deals: flags, updatedAt and total', () => {
  it('every item carries the flags and updatedAt, all false on a quiet deal', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    const open = await insertDeal(brand.user.id, 'OPEN');
    const item = await listItem(admin.cookie, open.id);
    expect(item).toMatchObject({
      hasOpenDispute: false,
      awaitingConfirmation: false,
      contentOverdue: false,
    });
    expect(Date.parse(item.updatedAt as string)).not.toBeNaN();
  });

  it('hasOpenDispute is true while a dispute is open and false once it is resolved', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });
    const other = await insertDeal(brand.user.id, 'OPEN');

    const raised = await raise(creator.cookie, deal.id);
    expect((await listItem(admin.cookie, deal.id)).hasOpenDispute).toBe(true);
    expect((await listItem(admin.cookie, other.id)).hasOpenDispute).toBe(false);

    await api.send('post', `/api/admin/disputes/${raised.body.dispute.id}/resolve`, admin.cookie, {
      resolution: 'Settled',
    });
    expect((await listItem(admin.cookie, deal.id)).hasOpenDispute).toBe(false);
  });

  it('contentOverdue follows the content deadline and the status, using the injected clock', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const late = await insertDeal(brand.user.id, 'ADVANCE_PAID', {
      creatorId: creator.user.id,
      contentUploadDeadline: '2026-10-08',
    });
    const onTime = await insertDeal(brand.user.id, 'ADVANCE_PAID', {
      creatorId: creator.user.id,
      contentUploadDeadline: '2026-10-09',
    });
    const uploaded = await insertDeal(brand.user.id, 'CONTENT_UPLOADED', {
      creatorId: creator.user.id,
      contentUploadDeadline: '2026-10-08',
    });
    expect((await listItem(admin.cookie, late.id)).contentOverdue).toBe(true);
    expect((await listItem(admin.cookie, onTime.id)).contentOverdue).toBe(false);
    expect((await listItem(admin.cookie, uploaded.id)).contentOverdue).toBe(false);
  });

  it('awaitingConfirmation is true only for a recorded payment of the due stage that nobody has answered', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'COMMISSION_PAID', { creatorId: creator.user.id });
    expect((await listItem(admin.cookie, deal.id)).awaitingConfirmation).toBe(false);

    const recorded = await recordPayment(api, brand, deal.id, 'ADVANCE');
    expect(recorded.status).toBe(201);
    expect((await listItem(admin.cookie, deal.id)).awaitingConfirmation).toBe(true);

    expect((await notReceived(api, creator, recorded.body.directPayment.id)).status).toBe(200);
    expect((await listItem(admin.cookie, deal.id)).awaitingConfirmation).toBe(false);
  });

  it('total counts every matching deal, ignoring the page size and the cursor, and follows the filters', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    for (let i = 0; i < 5; i++) await insertDeal(brand.user.id, 'OPEN');
    await insertDeal(brand.user.id, 'DRAFT');
    const target = await insertDeal(brand.user.id, 'DRAFT', { shortId: 'TOTL2345' });

    const all = await api.get('/api/admin/deals?limit=2', admin.cookie);
    expect(all.body.items).toHaveLength(2);
    expect(all.body.total).toBe(7);

    const second = await api.get(
      `/api/admin/deals?limit=2&cursor=${all.body.nextCursor}`,
      admin.cookie,
    );
    expect(second.body.total).toBe(7);

    expect((await api.get('/api/admin/deals?status=OPEN&limit=1', admin.cookie)).body.total).toBe(
      5,
    );
    expect((await api.get('/api/admin/deals?status=DRAFT', admin.cookie)).body.total).toBe(2);
    const searched = await api.get('/api/admin/deals?q=TOTL', admin.cookie);
    expect(searched.body.total).toBe(1);
    expect(searched.body.items[0].id).toBe(target.id);
    expect((await api.get('/api/admin/deals?q=NOPE', admin.cookie)).body.total).toBe(0);
  });
});

describe('GET /api/admin/disputes/:id', () => {
  it('shows who raised it, with their role, and resolvedBy once resolved', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });
    const byCreator = await raise(creator.cookie, deal.id, 'From the creator');

    const open = await api.get(`/api/admin/disputes/${byCreator.body.dispute.id}`, admin.cookie);
    expect(open.status).toBe(200);
    expect(open.body.dispute).toMatchObject({
      id: byCreator.body.dispute.id,
      dealId: deal.id,
      status: 'OPEN',
      description: 'Details',
      raisedBy: { id: creator.user.id, username: creator.user.username, role: 'CREATOR' },
      resolvedBy: null,
      resolvedAt: null,
    });

    await api.send(
      'post',
      `/api/admin/disputes/${byCreator.body.dispute.id}/resolve`,
      admin.cookie,
      {
        resolution: 'Settled',
        refundReference: 'rfnd_1',
      },
    );
    const byBrand = await raise(brand.cookie, deal.id, 'From the brand');
    const resolved = await api.get(
      `/api/admin/disputes/${byCreator.body.dispute.id}`,
      admin.cookie,
    );
    expect(resolved.body.dispute).toMatchObject({
      status: 'RESOLVED',
      resolution: 'Settled',
      refundReference: 'rfnd_1',
      resolvedBy: { id: admin.user.id, username: admin.user.username },
    });
    const brandRaised = await api.get(
      `/api/admin/disputes/${byBrand.body.dispute.id}`,
      admin.cookie,
    );
    expect(brandRaised.body.dispute.raisedBy).toMatchObject({ id: brand.user.id, role: 'BRAND' });
  });

  it('shows a deleted admin and a deleted raiser as "Deleted user"', async () => {
    const admin = await adminUser();
    const resolver = await adminUser();
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });
    const raised = await raise(creator.cookie, deal.id);
    await api.send(
      'post',
      `/api/admin/disputes/${raised.body.dispute.id}/resolve`,
      resolver.cookie,
      {
        resolution: 'Settled',
      },
    );
    await db
      .update(users)
      .set({ username: 'deleted_11112222', deletedAt: NOW })
      .where(eq(users.id, resolver.user.id));
    await db
      .update(users)
      .set({ username: 'deleted_33334444', deletedAt: NOW })
      .where(eq(users.id, creator.user.id));

    const res = await api.get(`/api/admin/disputes/${raised.body.dispute.id}`, admin.cookie);
    expect(res.body.dispute.resolvedBy.username).toBe('Deleted user');
    expect(res.body.dispute.raisedBy.username).toBe('Deleted user');
    expect(JSON.stringify(res.body)).not.toContain('deleted_');

    const list = await api.get('/api/admin/disputes', admin.cookie);
    expect(JSON.stringify(list.body)).not.toContain('deleted_');
  });

  it('is a 404 for an unknown id, a malformed id and a non-admin', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });
    const raised = await raise(creator.cookie, deal.id);
    const id = raised.body.dispute.id as string;

    expect(
      (await api.get('/api/admin/disputes/0197c0a0-0000-7000-8000-000000000000', admin.cookie))
        .status,
    ).toBe(404);
    expect((await api.get('/api/admin/disputes/not-an-id', admin.cookie)).status).toBe(404);
    for (const who of [brand, creator]) {
      expect((await api.get(`/api/admin/disputes/${id}`, who.cookie)).status).toBe(404);
    }
  });
});

describe('GET /api/admin/deals/:id: emails and events', () => {
  it('each email carries its body text, and no UPI ID appears anywhere in the detail', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });
    await raise(creator.cookie, deal.id, 'Late delivery');
    const mails = await sentEmails('DISPUTE_RAISED');
    expect(mails.length).toBeGreaterThan(0);

    const res = await api.get(`/api/admin/deals/${deal.id}`, admin.cookie);
    expect(res.status).toBe(200);
    const emails = res.body.emails as Array<{ template: string; bodyText: string }>;
    expect(emails.length).toBeGreaterThan(0);
    for (const email of emails) {
      expect(typeof email.bodyText).toBe('string');
      expect(email.bodyText.length).toBeGreaterThan(0);
    }
    const stored = mails.map((m) => m.bodyText).sort();
    expect(
      emails
        .filter((e) => e.template === 'DISPUTE_RAISED')
        .map((e) => e.bodyText)
        .sort(),
    ).toEqual(stored);
    expect(JSON.stringify(res.body)).not.toMatch(/[a-z0-9.]+@(ok|ybl|upi|paytm|axl)\w*/i);
  });

  it('shows the actor of an event by role, and a deleted actor as "Deleted user"', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });
    await api.send('post', `/api/admin/deals/${deal.id}/cancel`, admin.cookie, {
      note: 'Creator stopped responding',
      refundReference: 'rfnd_X',
    });
    await db
      .update(users)
      .set({ username: 'deleted_aaaabbbb', deletedAt: NOW })
      .where(eq(users.id, admin.user.id));

    const res = await api.get(`/api/admin/deals/${deal.id}`, (await adminUser()).cookie);
    const event = res.body.events.at(-1);
    expect(event).toMatchObject({
      kind: 'TRANSITION',
      toStatus: 'CANCELLED',
      refundReference: 'rfnd_X',
      actor: { type: 'ADMIN', role: 'ADMIN', username: 'Deleted user' },
    });
    expect(JSON.stringify(res.body)).not.toContain('deleted_aaaabbbb');
  });
});
