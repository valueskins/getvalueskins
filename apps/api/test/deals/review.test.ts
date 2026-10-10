import { DEAL_STATUSES, type DealStatus } from '@valueskins/shared';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { contentUploads, dealEvents, deals } from '../../src/db/schema/index.js';
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
let clock = NOW;
const api = http(createApp(env, { now: () => clock }));

beforeAll(resetDb);
beforeEach(async () => {
  clock = NOW;
  await truncateAll();
});
afterAll(closeDb);

const LINK = 'https://drive.google.com/file/d/abc123/view';
const upload = (cookie: string, dealId: string, link = LINK) =>
  api.send('post', `/api/deals/${dealId}/content`, cookie, { link });
const feedback = (cookie: string, dealId: string, text = 'Please reshoot the intro') =>
  api.send('post', `/api/deals/${dealId}/feedback`, cookie, { feedback: text });
const approve = (cookie: string, dealId: string) =>
  api.send('post', `/api/deals/${dealId}/approve`, cookie, {});

async function setup(status: DealStatus, overrides: Parameters<typeof insertDeal>[2] = {}) {
  const brand = await brandWithBilling();
  const creator = await creatorWithPayout();
  const deal = await insertDeal(brand.user.id, status, {
    creatorId: creator.user.id,
    ...overrides,
  });
  return { brand, creator, deal };
}

async function rowOf(dealId: string) {
  const [row] = await db.select().from(deals).where(eq(deals.id, dealId));
  return row!;
}

const uploadsOf = (dealId: string) =>
  db
    .select()
    .from(contentUploads)
    .where(eq(contentUploads.dealId, dealId))
    .orderBy(asc(contentUploads.uploadedAt), asc(contentUploads.id));

describe('POST /api/deals/:id/content', () => {
  it.each(['ADVANCE_PAID', 'REVISION_REQUESTED'] as DealStatus[])(
    'accepts a link from %s: records history, moves the deal, emails the brand (email 6)',
    async (status) => {
      const { brand, creator, deal } = await setup(status);
      const res = await upload(creator.cookie, deal.id);

      expect(res.status).toBe(200);
      expect(res.body.deal).toMatchObject({
        status: 'CONTENT_UPLOADED',
        contentLink: LINK,
        uploadCount: 1,
        contentUploadedAt: NOW.toISOString(),
        contentUploads: [{ link: LINK, uploadedAt: NOW.toISOString() }],
      });
      expect(await rowOf(deal.id)).toMatchObject({
        status: 'CONTENT_UPLOADED',
        contentLink: LINK,
        uploadCount: 1,
      });
      expect(await uploadsOf(deal.id)).toMatchObject([{ link: LINK }]);
      const events = await db.select().from(dealEvents).where(eq(dealEvents.dealId, deal.id));
      expect(events).toMatchObject([
        { fromStatus: status, toStatus: 'CONTENT_UPLOADED', actorId: creator.user.id },
      ]);

      const emails = await sentEmails('CONTENT_UPLOADED');
      expect(emails).toHaveLength(1);
      expect(emails[0]).toMatchObject({ toEmail: brand.user.email, dealId: deal.id });
      expect(emails[0]?.bodyText).toContain(LINK);
    },
  );

  it('is refused in every other status', async () => {
    for (const status of DEAL_STATUSES.filter(
      (s) => s !== 'ADVANCE_PAID' && s !== 'REVISION_REQUESTED',
    )) {
      const { creator, deal } = await setup(status);
      const res = await upload(creator.cookie, deal.id);
      expect(res.status, status).toBe(409);
      expect(res.body.error.code).toBe('WRONG_DEAL_STATUS');
      expect(await uploadsOf(deal.id)).toHaveLength(0);
    }
  });

  describe('the Drive rule', () => {
    it.each([
      'http://drive.google.com/file/d/abc',
      'https://example.com/file',
      'https://drive.google.com.evil.example/file',
      'https://notdrive.google.com/file',
      'ftp://drive.google.com/file',
      'drive.google.com/file',
      'not a url',
      '',
    ])('rejects %s', async (link) => {
      const { creator, deal } = await setup('ADVANCE_PAID');
      const res = await upload(creator.cookie, deal.id, link);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(await uploadsOf(deal.id)).toHaveLength(0);
      expect((await rowOf(deal.id)).status).toBe('ADVANCE_PAID');
    });

    it.each([
      'https://docs.google.com/document/d/abc/edit',
      'https://drive.google.com/drive/folders/x',
    ])('accepts %s', async (link) => {
      const { creator, deal } = await setup('ADVANCE_PAID');
      expect((await upload(creator.cookie, deal.id, link)).status).toBe(200);
    });
  });

  it('is only for the confirmed creator', async () => {
    const { brand, deal } = await setup('ADVANCE_PAID');
    const other = await creatorWithPayout();
    expect((await upload(other.cookie, deal.id)).status).toBe(404);
    expect((await upload(brand.cookie, deal.id)).status).toBe(403);
    expect(
      (await api.send('post', `/api/deals/${deal.id}/content`, undefined, { link: LINK })).status,
    ).toBe(401);
    expect((await upload(other.cookie, 'nope')).status).toBe(404);
    expect(await uploadsOf(deal.id)).toHaveLength(0);
  });

  it('keeps every link when the creator uploads again after feedback', async () => {
    const { brand, creator, deal } = await setup('ADVANCE_PAID');
    const first = 'https://drive.google.com/file/d/first/view';
    const second = 'https://drive.google.com/file/d/second/view';

    await upload(creator.cookie, deal.id, first);
    clock = new Date(NOW.getTime() + 60_000);
    await feedback(brand.cookie, deal.id);
    clock = new Date(NOW.getTime() + 120_000);
    const res = await upload(creator.cookie, deal.id, second);

    expect(res.status).toBe(200);
    expect(res.body.deal).toMatchObject({ contentLink: second, uploadCount: 2, revisionCount: 1 });
    expect(res.body.deal.contentUploads.map((u: { link: string }) => u.link)).toEqual([
      first,
      second,
    ]);
    expect((await uploadsOf(deal.id)).map((u) => u.link)).toEqual([first, second]);
    expect(await sentEmails('CONTENT_UPLOADED')).toHaveLength(2);
  });

  it('allows 20 links per deal and refuses the 21st', async () => {
    const { brand, creator, deal } = await setup('ADVANCE_PAID', { uploadCount: 19 });
    expect((await upload(creator.cookie, deal.id)).status).toBe(200);
    expect((await rowOf(deal.id)).uploadCount).toBe(20);

    await feedback(brand.cookie, deal.id);
    const detail = await api.get(`/api/deals/${deal.id}`, creator.cookie);
    expect(detail.body.deal.allowedActions).toEqual([
      {
        action: 'UPLOAD_CONTENT',
        enabled: false,
        reason: 'The limit of 20 content links for this deal has been reached',
      },
      { action: 'RAISE_DISPUTE', enabled: true, reason: null },
    ]);

    const res = await upload(creator.cookie, deal.id);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('UPLOAD_LIMIT_REACHED');
    const after = await rowOf(deal.id);
    expect(after).toMatchObject({ status: 'REVISION_REQUESTED', uploadCount: 20 });
    expect(await uploadsOf(deal.id)).toHaveLength(1);
  });

  it('is still allowed after the content upload deadline (it is only flagged overdue)', async () => {
    const { creator, deal } = await setup('ADVANCE_PAID', { contentUploadDeadline: '2026-10-09' });
    clock = new Date('2026-10-20T00:00:00Z');
    expect((await upload(creator.cookie, deal.id)).status).toBe(200);
  });

  it('lets only one of two parallel uploads in', async () => {
    const { creator, deal } = await setup('ADVANCE_PAID');
    const [a, b] = await Promise.all([
      upload(creator.cookie, deal.id),
      upload(creator.cookie, deal.id),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await uploadsOf(deal.id)).toHaveLength(1);
    expect((await rowOf(deal.id)).uploadCount).toBe(1);
    expect(await sentEmails('CONTENT_UPLOADED')).toHaveLength(1);
  });
});

describe('POST /api/deals/:id/feedback', () => {
  it('asks for changes: revision count, latest feedback, event note and email 7', async () => {
    const { brand, creator, deal } = await setup('CONTENT_UPLOADED');
    const text = 'Please reshoot the intro <b>now</b>';
    const res = await feedback(brand.cookie, deal.id, text);

    expect(res.status).toBe(200);
    expect(res.body.deal).toMatchObject({
      status: 'REVISION_REQUESTED',
      revisionCount: 1,
      feedback: text,
      revisionNotice: null,
    });
    const events = await db.select().from(dealEvents).where(eq(dealEvents.dealId, deal.id));
    expect(events).toMatchObject([
      {
        fromStatus: 'CONTENT_UPLOADED',
        toStatus: 'REVISION_REQUESTED',
        actorId: brand.user.id,
        note: text,
      },
    ]);
    const emails = await sentEmails('CHANGES_REQUESTED');
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ toEmail: creator.user.email, dealId: deal.id });
    expect(emails[0]?.bodyText).toContain(text);
  });

  it('counts each round and shows the 5-revision notice to both parties', async () => {
    const { brand, creator, deal } = await setup('CONTENT_UPLOADED', { revisionCount: 4 });
    await feedback(brand.cookie, deal.id);
    for (const cookie of [brand.cookie, creator.cookie]) {
      const body = (await api.get(`/api/deals/${deal.id}`, cookie)).body.deal;
      expect(body.revisionCount).toBe(5);
      expect(body.revisionNotice).toBe(
        'This deal has had 5 revisions. If you cannot agree, raise a dispute.',
      );
    }
    // Nothing is blocked after 5.
    await upload(creator.cookie, deal.id);
    expect((await feedback(brand.cookie, deal.id)).status).toBe(200);
    expect((await rowOf(deal.id)).revisionCount).toBe(6);
  });

  it('is refused outside CONTENT_UPLOADED, for another brand, and without text', async () => {
    for (const status of DEAL_STATUSES.filter((s) => s !== 'CONTENT_UPLOADED')) {
      const { brand, deal } = await setup(status);
      const res = await feedback(brand.cookie, deal.id);
      expect(res.status, status).toBe(409);
      expect(res.body.error.code).toBe('WRONG_DEAL_STATUS');
    }
    const { brand, creator, deal } = await setup('CONTENT_UPLOADED');
    const otherBrand = await brandWithBilling();
    expect((await feedback(otherBrand.cookie, deal.id)).status).toBe(404);
    expect((await feedback(creator.cookie, deal.id)).status).toBe(403);
    expect((await feedback(brand.cookie, deal.id, '')).status).toBe(400);
    expect((await rowOf(deal.id)).status).toBe('CONTENT_UPLOADED');
  });
});

describe('POST /api/deals/:id/approve', () => {
  it('approves: timestamp, event and email 8 to the creator', async () => {
    const { brand, creator, deal } = await setup('CONTENT_UPLOADED');
    const res = await approve(brand.cookie, deal.id);
    expect(res.status).toBe(200);
    expect(res.body.deal).toMatchObject({ status: 'APPROVED', approvedAt: NOW.toISOString() });
    expect(res.body.deal.allowedActions.map((a: { action: string }) => a.action)).toEqual([
      'PAY_FINAL',
      'CANCEL',
      'RAISE_DISPUTE',
    ]);
    const emails = await sentEmails('CONTENT_APPROVED');
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ toEmail: creator.user.email, dealId: deal.id });
    expect(emails[0]?.bodyText).toContain('Waiting for final payment');
  });

  it('is refused outside CONTENT_UPLOADED and for anyone but the brand', async () => {
    for (const status of DEAL_STATUSES.filter((s) => s !== 'CONTENT_UPLOADED')) {
      const { brand, deal } = await setup(status);
      expect((await approve(brand.cookie, deal.id)).status, status).toBe(409);
    }
    const { creator, deal } = await setup('CONTENT_UPLOADED');
    const otherBrand = await brandWithBilling();
    expect((await approve(otherBrand.cookie, deal.id)).status).toBe(404);
    expect((await approve(creator.cookie, deal.id)).status).toBe(403);
    expect((await api.send('post', `/api/deals/${deal.id}/approve`, undefined, {})).status).toBe(
      401,
    );
    expect((await rowOf(deal.id)).status).toBe('CONTENT_UPLOADED');
  });

  it('lets exactly one of an approve and a feedback race win', async () => {
    const { brand, deal } = await setup('CONTENT_UPLOADED');
    const [a, b] = await Promise.all([
      approve(brand.cookie, deal.id),
      feedback(brand.cookie, deal.id),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await db.select().from(dealEvents).where(eq(dealEvents.dealId, deal.id))).toHaveLength(
      1,
    );
  });
});

describe('allowed actions for the delivery phase', () => {
  const actionsFor = async (cookie: string, dealId: string) =>
    (await api.get(`/api/deals/${dealId}`, cookie)).body.deal.allowedActions as Array<{
      action: string;
      enabled: boolean;
    }>;

  it('shows each person only their own actions', async () => {
    const { brand, creator, deal } = await setup('CONTENT_UPLOADED');
    const otherCreator = await creatorWithPayout('ACTIVE', { isAdmin: true });
    expect((await actionsFor(brand.cookie, deal.id)).map((a) => a.action)).toEqual([
      'SEND_FEEDBACK',
      'APPROVE',
      'CANCEL',
      'RAISE_DISPUTE',
    ]);
    expect((await actionsFor(creator.cookie, deal.id)).map((a) => a.action)).toEqual([
      'RAISE_DISPUTE',
    ]);
    // An admin who is also a creator, but not this deal's creator, gets nothing.
    expect(await actionsFor(otherCreator.cookie, deal.id)).toEqual([]);

    const waiting = await setup('ADVANCE_PAID');
    expect(
      (await actionsFor(waiting.creator.cookie, waiting.deal.id)).map((a) => a.action),
    ).toEqual(['UPLOAD_CONTENT', 'RAISE_DISPUTE']);
    expect(await actionsFor(otherCreator.cookie, waiting.deal.id)).toEqual([]);
  });
});
