import {
  dealDetailResponseSchema,
  dealListResponseSchema,
  type DealStatus,
} from '@valueskins/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { brandBilling, directPayments, users } from '../../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { createUserWithSession } from '../helpers/auth.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http,
  insertApplication,
  insertDeal,
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

describe('GET /api/deals/feed', () => {
  it('lists only OPEN deals whose applications are still open', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const open = await insertDeal(brand.user.id, 'OPEN');
    const lastDay = await insertDeal(brand.user.id, 'OPEN', { applicationDeadline: '2026-10-09' });
    await insertDeal(brand.user.id, 'OPEN', { applicationDeadline: '2026-10-08' });
    await insertDeal(brand.user.id, 'DRAFT');
    await insertDeal(brand.user.id, 'CONFIRMED');
    await insertDeal(brand.user.id, 'CANCELLED');

    const res = await api.get('/api/deals/feed', creator.cookie);
    expect(res.status).toBe(200);
    const parsed = dealListResponseSchema.parse(res.body);
    expect(parsed.items.map((d) => d.id).sort()).toEqual([open.id, lastDay.id].sort());
    expect(parsed.nextCursor).toBeNull();
  });

  it('drops a deal once its application deadline has passed in IST', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    await insertDeal(brand.user.id, 'OPEN', { applicationDeadline: '2026-10-09' });

    clock = new Date('2026-10-09T18:29:59Z');
    expect((await api.get('/api/deals/feed', creator.cookie)).body.items).toHaveLength(1);
    clock = new Date('2026-10-09T18:30:00Z');
    expect((await api.get('/api/deals/feed', creator.cookie)).body.items).toHaveLength(0);
  });

  it('shows the brand, budget, creator amount and deadlines, and no commission figures', async () => {
    const brand = await brandWithBilling({ profilePictureUrl: 'https://example.com/b.jpg' });
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'OPEN');

    const [item] = (await api.get('/api/deals/feed', creator.cookie)).body.items;
    expect(item).toMatchObject({
      id: deal.id,
      title: deal.title,
      description: 'Description',
      budgetPaise: deal.budgetPaise,
      creatorAmountPaise: deal.creatorAmountPaise,
      applicationDeadline: '2026-10-12',
      brand: {
        id: brand.user.id,
        username: brand.user.username,
        profilePictureUrl: 'https://example.com/b.jpg',
      },
    });
    expect(item).not.toHaveProperty('commissionTotalPaise');
  });

  it('is newest published first and pages without gaps or repeats, including equal timestamps', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const ids: string[] = [];
    // Two share a publish time to exercise the id tiebreak.
    const times = ['2026-10-01', '2026-10-02', '2026-10-02', '2026-10-03', '2026-10-04'];
    for (const day of times) {
      const deal = await insertDeal(brand.user.id, 'OPEN', {
        publishedAt: new Date(`${day}T05:00:00.000Z`),
      });
      ids.push(deal.id);
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const query: string = `limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await api.get(`/api/deals/feed?${query}`, creator.cookie);
      expect(res.status).toBe(200);
      seen.push(...res.body.items.map((d: { id: string }) => d.id));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }

    expect(new Set(seen).size).toBe(5);
    expect(seen.sort()).toEqual([...ids].sort());
  });

  it('returns pages in publish order', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const older = await insertDeal(brand.user.id, 'OPEN', {
      publishedAt: new Date('2026-10-01T05:00:00.000Z'),
    });
    const newer = await insertDeal(brand.user.id, 'OPEN', {
      publishedAt: new Date('2026-10-05T05:00:00.000Z'),
    });
    const first = await api.get('/api/deals/feed?limit=1', creator.cookie);
    expect(first.body.items.map((d: { id: string }) => d.id)).toEqual([newer.id]);
    const second = await api.get(
      `/api/deals/feed?limit=1&cursor=${first.body.nextCursor}`,
      creator.cookie,
    );
    expect(second.body.items.map((d: { id: string }) => d.id)).toEqual([older.id]);
    expect(second.body.nextCursor).toBeNull();
  });

  it.each(['garbage', Buffer.from('{"i":"nope"}').toString('base64url')])(
    'rejects the cursor %s',
    async (cursor) => {
      const creator = await creatorWithPayout();
      const res = await api.get(`/api/deals/feed?cursor=${cursor}`, creator.cookie);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CURSOR');
    },
  );

  it('rejects a limit above 50', async () => {
    const creator = await creatorWithPayout();
    expect((await api.get('/api/deals/feed?limit=51', creator.cookie)).status).toBe(400);
  });
});

describe('GET /api/deals/mine', () => {
  it("shows a brand all of its own deals, drafts included, and nobody else's", async () => {
    const brand = await brandWithBilling();
    const other = await brandWithBilling();
    const mine = [
      await insertDeal(brand.user.id, 'DRAFT'),
      await insertDeal(brand.user.id, 'OPEN'),
      await insertDeal(brand.user.id, 'CANCELLED'),
    ];
    await insertDeal(other.user.id, 'OPEN');

    const res = await api.get('/api/deals/mine', brand.cookie);
    expect(res.status).toBe(200);
    const parsed = dealListResponseSchema.parse(res.body);
    // UUID v7 ids: newest first.
    expect(parsed.items.map((d) => d.id)).toEqual(mine.map((d) => d.id).reverse());
  });

  it('filters by status and pages', async () => {
    const brand = await brandWithBilling();
    for (let i = 0; i < 3; i++) await insertDeal(brand.user.id, 'OPEN');
    await insertDeal(brand.user.id, 'DRAFT');

    const filtered = await api.get('/api/deals/mine?status=OPEN&limit=2', brand.cookie);
    expect(filtered.body.items).toHaveLength(2);
    expect(filtered.body.nextCursor).not.toBeNull();
    const rest = await api.get(
      `/api/deals/mine?status=OPEN&limit=2&cursor=${filtered.body.nextCursor}`,
      brand.cookie,
    );
    expect(rest.body.items).toHaveLength(1);
    expect(rest.body.nextCursor).toBeNull();
    expect((await api.get('/api/deals/mine?status=NOPE', brand.cookie)).status).toBe(400);
  });

  it('shows a creator only the deals they are confirmed on', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const otherCreator = await creatorWithPayout();
    const confirmed = await insertDeal(brand.user.id, 'CONFIRMED', { creatorId: creator.user.id });
    await insertDeal(brand.user.id, 'CONFIRMED', { creatorId: otherCreator.user.id });
    const applied = await insertDeal(brand.user.id, 'OPEN');
    await insertApplication(applied.id, creator.user.id);

    const res = await api.get('/api/deals/mine', creator.cookie);
    expect(res.body.items.map((d: { id: string }) => d.id)).toEqual([confirmed.id]);
  });
});

describe('GET /api/deals/:id visibility (SPEC 16)', () => {
  const STATUSES: DealStatus[] = [
    'DRAFT',
    'OPEN',
    'CONFIRMED',
    'COMMISSION_PAID',
    'ADVANCE_PAID',
    'COMPLETED',
    'CANCELLED',
  ];

  it.each(STATUSES)('%s: who can see it', async (status) => {
    const brand = await brandWithBilling();
    const confirmed = await creatorWithPayout();
    const stranger = await creatorWithPayout();
    const otherBrand = await brandWithBilling();
    const admin = await brandWithBilling({ isAdmin: true });
    const deal = await insertDeal(brand.user.id, status, {
      creatorId: status === 'DRAFT' || status === 'OPEN' ? null : confirmed.user.id,
    });
    const seeIt = async (cookie: string) => (await api.get(`/api/deals/${deal.id}`, cookie)).status;

    expect(await seeIt(brand.cookie)).toBe(200);
    expect(await seeIt(admin.cookie)).toBe(200);
    // The creator is only attached to the deal from CONFIRMED on; an OPEN deal is visible to all.
    expect(await seeIt(confirmed.cookie)).toBe(status === 'DRAFT' ? 404 : 200);
    expect(await seeIt(stranger.cookie)).toBe(status === 'OPEN' ? 200 : 404);
    expect(await seeIt(otherBrand.cookie)).toBe(status === 'OPEN' ? 200 : 404);
  });

  it('answers 404 for an unknown id and for an id that is not a UUID', async () => {
    const brand = await brandWithBilling();
    expect(
      (await api.get('/api/deals/01a11f37-1217-712d-962d-13a5004bd584', brand.cookie)).status,
    ).toBe(404);
    expect((await api.get('/api/deals/feed-me', brand.cookie)).status).toBe(404);
  });
});

describe('GET /api/deals/:id body', () => {
  it('gives the brand the frozen breakdown, the application count, the creator and their payout status', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout('ACTIVE');
    const deal = await insertDeal(brand.user.id, 'CONFIRMED', { creatorId: creator.user.id });
    await insertApplication(deal.id, creator.user.id, 'CONFIRMED');

    const res = await api.get(`/api/deals/${deal.id}`, brand.cookie);
    const { deal: body } = dealDetailResponseSchema.parse(res.body);
    expect(body).toMatchObject({
      commissionTotalPaise: deal.commissionTotalPaise,
      advancePaise: deal.advancePaise,
      finalPaise: deal.finalPaise,
      creator: { id: creator.user.id, username: creator.user.username },
      creatorPayoutSet: true,
      applicationCount: 1,
      applicationsOpen: false,
      contentOverdue: false,
    });
  });

  it('hides the payout status and application count from a creator', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'CONFIRMED', { creatorId: creator.user.id });
    const body = (await api.get(`/api/deals/${deal.id}`, creator.cookie)).body.deal;
    expect(body.creatorPayoutSet).toBeNull();
    expect(body.applicationCount).toBeNull();
    expect(body.allowedActions).toEqual([{ action: 'RAISE_DISPUTE', enabled: true, reason: null }]);
  });

  it('shows a deleted brand as "Deleted user"', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, brand.user.id));
    const body = (await api.get(`/api/deals/${deal.id}`, creator.cookie)).body.deal;
    expect(body.brand).toMatchObject({ username: 'Deleted user', profilePictureUrl: null });
  });

  it('sets content_overdue from the content upload deadline in IST', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'ADVANCE_PAID', {
      creatorId: creator.user.id,
      contentUploadDeadline: '2026-10-09',
    });
    clock = new Date('2026-10-09T18:29:59Z');
    expect((await api.get(`/api/deals/${deal.id}`, brand.cookie)).body.deal.contentOverdue).toBe(
      false,
    );
    clock = new Date('2026-10-09T18:30:01Z');
    expect((await api.get(`/api/deals/${deal.id}`, brand.cookie)).body.deal.contentOverdue).toBe(
      true,
    );
  });

  it('needs a finished onboarding', async () => {
    const brand = await brandWithBilling();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    const newcomer = await createUserWithSession({ role: 'CREATOR' });
    const res = await api.get(`/api/deals/${deal.id}`, newcomer.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ONBOARDING_INCOMPLETE');
  });
});

describe('allowedActions through GET /api/deals/:id', () => {
  const actions = async (cookie: string, dealId: string) =>
    (await api.get(`/api/deals/${dealId}`, cookie)).body.deal.allowedActions as Array<{
      action: string;
      enabled: boolean;
      reason: string | null;
    }>;

  it('draft: publish is disabled until the draft is ready and billing exists', async () => {
    const brand = await brandWithBilling();
    const empty = await insertDeal(brand.user.id, 'DRAFT', { title: null, description: null });
    expect(await actions(brand.cookie, empty.id)).toEqual([
      { action: 'EDIT_DRAFT', enabled: true, reason: null },
      { action: 'DELETE_DRAFT', enabled: true, reason: null },
      { action: 'PUBLISH', enabled: false, reason: 'Add a title' },
    ]);

    const ready = await insertDeal(brand.user.id, 'DRAFT');
    expect((await actions(brand.cookie, ready.id))[2]).toEqual({
      action: 'PUBLISH',
      enabled: true,
      reason: null,
    });

    await db.delete(brandBilling).where(eq(brandBilling.userId, brand.user.id));
    expect((await actions(brand.cookie, ready.id))[2]).toEqual({
      action: 'PUBLISH',
      enabled: false,
      reason: 'Add billing details to publish',
    });
  });

  it('open: the creator sees why Apply is disabled', async () => {
    const brand = await brandWithBilling();
    const noPayout = await creatorWithPayout(null);
    const noConsent = await creatorWithPayout(null, {
      payoutVpa: 'a.b@okaxis',
      payoutName: 'A B',
    });
    const active = await creatorWithPayout('ACTIVE');
    const deal = await insertDeal(brand.user.id, 'OPEN');

    expect(await actions(noPayout.cookie, deal.id)).toEqual([
      { action: 'APPLY', enabled: false, reason: 'Add your UPI ID to apply' },
    ]);
    expect((await actions(noConsent.cookie, deal.id))[0]?.reason).toBe('Add your UPI ID to apply');
    expect(await actions(active.cookie, deal.id)).toEqual([
      { action: 'APPLY', enabled: true, reason: null },
    ]);

    await insertApplication(deal.id, active.user.id);
    expect((await actions(active.cookie, deal.id))[0]).toEqual({
      action: 'APPLY',
      enabled: false,
      reason: 'You have already applied',
    });

    clock = new Date('2026-10-13T00:00:00Z');
    expect((await actions(noConsent.cookie, deal.id))[0]?.reason).toBe('Applications closed');
  });

  it('open: the brand can cancel, and can confirm once someone applied, even after the deadline', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    expect(await actions(brand.cookie, deal.id)).toEqual([
      { action: 'CONFIRM_CREATOR', enabled: false, reason: 'No applications yet' },
      { action: 'CANCEL', enabled: true, reason: null },
    ]);
    await insertApplication(deal.id, creator.user.id);
    clock = new Date('2026-10-13T00:00:00Z');
    expect(await actions(brand.cookie, deal.id)).toEqual([
      { action: 'CONFIRM_CREATOR', enabled: true, reason: null },
      { action: 'CANCEL', enabled: true, reason: null },
    ]);
  });

  it('the advance and the final: the brand pays by UPI once the creator has a UPI ID', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const noUpi = await creatorWithPayout(null);

    const advance = await insertDeal(brand.user.id, 'COMMISSION_PAID', {
      creatorId: creator.user.id,
    });
    expect(await actions(brand.cookie, advance.id)).toContainEqual({
      action: 'PAY_ADVANCE',
      enabled: true,
      reason: null,
    });
    const final = await insertDeal(brand.user.id, 'APPROVED', { creatorId: creator.user.id });
    expect(await actions(brand.cookie, final.id)).toContainEqual({
      action: 'PAY_FINAL',
      enabled: true,
      reason: null,
    });

    const stuck = await insertDeal(brand.user.id, 'COMMISSION_PAID', { creatorId: noUpi.user.id });
    expect(await actions(brand.cookie, stuck.id)).toContainEqual({
      action: 'PAY_ADVANCE',
      enabled: false,
      reason: 'The creator has not added a UPI ID yet',
    });
  });

  it('the creator is offered the confirmation only once a payment is recorded', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'COMMISSION_PAID', { creatorId: creator.user.id });
    const confirmOf = async () =>
      (await actions(creator.cookie, deal.id)).find((a) => a.action === 'CONFIRM_PAYMENT_RECEIVED');

    expect(await confirmOf()).toEqual({
      action: 'CONFIRM_PAYMENT_RECEIVED',
      enabled: false,
      reason: 'The brand has not recorded a payment yet',
    });
    await db.insert(directPayments).values({
      dealId: deal.id,
      stage: 'ADVANCE',
      amountPaise: deal.advancePaise!,
      reference: 'UTR123456',
      paidToVpa: 'someone@okaxis',
      recordedBy: brand.user.id,
    });
    expect(await confirmOf()).toEqual({
      action: 'CONFIRM_PAYMENT_RECEIVED',
      enabled: true,
      reason: null,
    });
    // The brand now waits for the creator.
    expect((await actions(brand.cookie, deal.id)).find((a) => a.action === 'PAY_ADVANCE')).toEqual({
      action: 'PAY_ADVANCE',
      enabled: false,
      reason: 'Waiting for the creator to confirm the payment you recorded',
    });
  });

  it('advance paid: the brand sees cancel disabled with the fee-paid reason', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });
    expect(await actions(brand.cookie, deal.id)).toEqual([
      {
        action: 'CANCEL',
        enabled: false,
        reason:
          'The deal cannot be cancelled after the fee is paid. Write to us if something is wrong.',
      },
      { action: 'RAISE_DISPUTE', enabled: true, reason: null },
    ]);
  });
});
