import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { deals, disputes } from '../../src/db/schema/index.js';
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

async function disputedDeal(subject = 'Late delivery') {
  const brand = await brandWithBilling();
  const creator = await creatorWithPayout();
  const deal = await insertDeal(brand.user.id, 'CONTENT_UPLOADED', { creatorId: creator.user.id });
  const res = await api.send('post', `/api/deals/${deal.id}/disputes`, creator.cookie, {
    subject,
    description: 'Details',
  });
  expect(res.status).toBe(201);
  return { brand, creator, deal, dispute: res.body.dispute as { id: string } };
}

const resolve = (cookie: string, id: string, body: object = { resolution: 'Refunded in full' }) =>
  api.send('post', `/api/admin/disputes/${id}/resolve`, cookie, body);

describe('POST /api/admin/disputes/:id/resolve', () => {
  it('records the resolution and emails both parties', async () => {
    const admin = await adminUser();
    const { brand, creator, deal, dispute } = await disputedDeal();

    const res = await resolve(admin.cookie, dispute.id, {
      resolution: 'Refunded the brand in full',
      refundReference: 'rfnd_Abc123',
    });
    expect(res.status).toBe(200);
    expect(res.body.dispute).toMatchObject({
      id: dispute.id,
      status: 'RESOLVED',
      resolution: 'Refunded the brand in full',
      refundReference: 'rfnd_Abc123',
      resolvedAt: NOW.toISOString(),
    });

    const [row] = await db.select().from(disputes).where(eq(disputes.id, dispute.id));
    expect(row).toMatchObject({ status: 'RESOLVED', resolvedById: admin.user.id });

    const mails = await sentEmails('DISPUTE_RESOLVED');
    expect(mails.map((m) => m.toEmail).sort()).toEqual(
      [brand.user.email, creator.user.email].sort(),
    );
    for (const mail of mails) {
      expect(mail.dealId).toBe(deal.id);
      expect(mail.bodyText).toContain('Refunded the brand in full');
      expect(mail.bodyText).toContain('Refund reference: rfnd_Abc123');
    }
    // Resolving a dispute does not touch the deal.
    expect((await db.select().from(deals).where(eq(deals.id, deal.id)))[0]?.status).toBe(
      'CONTENT_UPLOADED',
    );
  });

  it('leaves the refund line out when there is no reference', async () => {
    const admin = await adminUser();
    const { dispute } = await disputedDeal();
    expect((await resolve(admin.cookie, dispute.id)).status).toBe(200);
    const [mail] = await sentEmails('DISPUTE_RESOLVED');
    expect(mail?.bodyText).not.toContain('Refund reference');
  });

  it('needs a resolution note', async () => {
    const admin = await adminUser();
    const { dispute } = await disputedDeal();
    for (const body of [{}, { resolution: '' }, { resolution: '   ' }, { refundReference: 'x' }]) {
      expect((await resolve(admin.cookie, dispute.id, body)).status).toBe(400);
    }
    expect((await db.select().from(disputes))[0]?.status).toBe('OPEN');
    expect(await sentEmails('DISPUTE_RESOLVED')).toHaveLength(0);
  });

  it('a second resolve is a 409 and sends no more emails; parallel resolves give one winner', async () => {
    const admin = await adminUser();
    const { dispute } = await disputedDeal();
    const both = await Promise.all([
      resolve(admin.cookie, dispute.id),
      resolve(admin.cookie, dispute.id, { resolution: 'Other' }),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);

    const again = await resolve(admin.cookie, dispute.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('DISPUTE_ALREADY_RESOLVED');
    expect(await sentEmails('DISPUTE_RESOLVED')).toHaveLength(2);
  });

  it('is 404 for an unknown dispute', async () => {
    const admin = await adminUser();
    expect((await resolve(admin.cookie, '0197c0a0-0000-7000-8000-000000000000')).status).toBe(404);
  });
});

describe('GET /api/admin/disputes', () => {
  it('lists newest first, filters by status and pages without gaps', async () => {
    const admin = await adminUser();
    const made = [];
    for (let i = 0; i < 5; i++) made.push(await disputedDeal(`Dispute ${i}`));
    await resolve(admin.cookie, made[1]!.dispute.id);

    const all = await api.get('/api/admin/disputes?limit=50', admin.cookie);
    expect(all.status).toBe(200);
    expect(all.body.items.map((d: { subject: string }) => d.subject)).toEqual([
      'Dispute 4',
      'Dispute 3',
      'Dispute 2',
      'Dispute 1',
      'Dispute 0',
    ]);
    expect(all.body.items[0]).toMatchObject({
      status: 'OPEN',
      dealId: made[4]!.deal.id,
      dealShortId: made[4]!.deal.shortId,
      raisedBy: { id: made[4]!.creator.user.id },
    });

    const open = await api.get('/api/admin/disputes?status=OPEN&limit=50', admin.cookie);
    expect(open.body.items).toHaveLength(4);
    const resolved = await api.get('/api/admin/disputes?status=RESOLVED', admin.cookie);
    expect(resolved.body.items.map((d: { id: string }) => d.id)).toEqual([made[1]!.dispute.id]);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { body: { items: { id: string }[]; nextCursor: string | null } } = await api.get(
        `/api/admin/disputes?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
        admin.cookie,
      );
      seen.push(...page.body.items.map((d) => d.id));
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(seen).toEqual(all.body.items.map((d: { id: string }) => d.id));
  });

  it('rejects a bad status or cursor', async () => {
    const admin = await adminUser();
    expect((await api.get('/api/admin/disputes?status=CLOSED', admin.cookie)).status).toBe(400);
    expect((await api.get('/api/admin/disputes?cursor=junk', admin.cookie)).status).toBe(400);
  });
});
