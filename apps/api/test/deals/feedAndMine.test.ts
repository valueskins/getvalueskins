import {
  dealFeedResponseSchema,
  dealMineResponseSchema,
  type DealStatus,
} from '@valueskins/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http,
  insertApplication,
  insertDeal,
} from '../helpers/deals.js';
import { HOUR, ago, insertRecord } from '../jobs/helpers.js';
import { buildTestEnv } from '../testEnv.js';

const api = http(createApp(buildTestEnv(), { now: () => NOW }));

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

describe('GET /api/deals/feed: advance, final and applied', () => {
  it('gives the two payments the creator receives, as frozen at publish', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'OPEN');

    const res = await api.get('/api/deals/feed', creator.cookie);
    const [item] = dealFeedResponseSchema.parse(res.body).items;

    expect(item).toMatchObject({
      id: deal.id,
      creatorAmountPaise: deal.creatorAmountPaise,
      advancePaise: deal.advancePaise,
      finalPaise: deal.finalPaise,
    });
    expect((item?.advancePaise ?? 0) + (item?.finalPaise ?? 0)).toBe(item?.creatorAmountPaise);
  });

  it('marks the deals the signed-in creator applied to, and not the ones someone else applied to', async () => {
    const brand = await brandWithBilling();
    const me = await creatorWithPayout();
    const other = await creatorWithPayout();
    const mine = await insertDeal(brand.user.id, 'OPEN');
    const theirs = await insertDeal(brand.user.id, 'OPEN');
    const nobody = await insertDeal(brand.user.id, 'OPEN');
    await insertApplication(mine.id, me.user.id);
    await insertApplication(theirs.id, other.user.id);

    const asMe = dealFeedResponseSchema.parse((await api.get('/api/deals/feed', me.cookie)).body);
    const byId = Object.fromEntries(asMe.items.map((i) => [i.id, i.applied]));
    expect(byId).toEqual({ [mine.id]: true, [theirs.id]: false, [nobody.id]: false });

    const asOther = dealFeedResponseSchema.parse(
      (await api.get('/api/deals/feed', other.cookie)).body,
    );
    expect(Object.fromEntries(asOther.items.map((i) => [i.id, i.applied]))).toEqual({
      [mine.id]: false,
      [theirs.id]: true,
      [nobody.id]: false,
    });
  });

  it('marks a rejected application as applied too, and pages keep the marks', async () => {
    const brand = await brandWithBilling();
    const me = await creatorWithPayout();
    const deals = [];
    for (let i = 0; i < 3; i++) deals.push(await insertDeal(brand.user.id, 'OPEN'));
    await insertApplication(deals[1]!.id, me.user.id, 'REJECTED');

    const first = await api.get('/api/deals/feed?limit=2', me.cookie);
    const second = await api.get(
      `/api/deals/feed?limit=2&cursor=${first.body.nextCursor}`,
      me.cookie,
    );
    const all = [...first.body.items, ...second.body.items] as Array<{
      id: string;
      applied: boolean;
    }>;
    expect(all).toHaveLength(3);
    expect(all.filter((i) => i.applied).map((i) => i.id)).toEqual([deals[1]!.id]);
  });

  it('is only for onboarded creators, and shows nothing about money a brand sees', async () => {
    const brand = await brandWithBilling();
    expect((await api.get('/api/deals/feed', brand.cookie)).status).toBe(403);
    expect((await api.get('/api/deals/feed')).status).toBe(401);
  });
});

const parseMine = (body: unknown) => dealMineResponseSchema.parse(body).items;

describe('GET /api/deals/mine: the status filter', () => {
  async function brandWithDeals() {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const make = (status: DealStatus) =>
      insertDeal(
        brand.user.id,
        status,
        status === 'DRAFT' || status === 'OPEN' ? {} : { creatorId: creator.user.id },
      );
    const deals = {
      draft: await make('DRAFT'),
      open: await make('OPEN'),
      confirmed: await make('CONFIRMED'),
      cancelled: await make('CANCELLED'),
    };
    return { brand, creator, deals };
  }

  it('takes one status, several separated by commas, or none', async () => {
    const { brand, deals } = await brandWithDeals();
    const ids = async (query: string) =>
      parseMine((await api.get(`/api/deals/mine${query}`, brand.cookie)).body)
        .map((i) => i.id)
        .sort();

    expect(await ids('')).toHaveLength(4);
    expect(await ids('?status=OPEN')).toEqual([deals.open.id]);
    expect(await ids('?status=OPEN,CONFIRMED')).toEqual([deals.open.id, deals.confirmed.id].sort());
    expect(await ids('?status=DRAFT,CANCELLED,OPEN')).toEqual(
      [deals.draft.id, deals.cancelled.id, deals.open.id].sort(),
    );
    expect(await ids('?status=COMPLETED,APPROVED')).toEqual([]);
  });

  it.each(['NOPE', 'OPEN,NOPE', 'OPEN,', '', ','])(
    'rejects the status %j with 400',
    async (bad) => {
      const { brand } = await brandWithDeals();
      const res = await api.get(`/api/deals/mine?status=${encodeURIComponent(bad)}`, brand.cookie);
      expect(res.status).toBe(400);
    },
  );

  it('pages without gaps or repeats while filtered', async () => {
    const brand = await brandWithBilling();
    const open: string[] = [];
    for (let i = 0; i < 5; i++) open.push((await insertDeal(brand.user.id, 'OPEN')).id);
    await insertDeal(brand.user.id, 'DRAFT');
    await insertDeal(brand.user.id, 'DRAFT');

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const res: { body: { items: Array<{ id: string }>; nextCursor: string | null } } =
        await api.get(
          `/api/deals/mine?status=OPEN,CONFIRMED&limit=2${cursor ? `&cursor=${cursor}` : ''}`,
          brand.cookie,
        );
      seen.push(...res.body.items.map((i) => i.id));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(seen.sort()).toEqual([...open].sort());
  });

  it("never lists another brand's deals, or deals a creator is not confirmed on", async () => {
    const { brand, creator, deals } = await brandWithDeals();
    const otherBrand = await brandWithBilling();
    const otherCreator = await creatorWithPayout();
    await insertDeal(otherBrand.user.id, 'OPEN');

    expect(parseMine((await api.get('/api/deals/mine', otherBrand.cookie)).body)).toHaveLength(1);
    expect(parseMine((await api.get('/api/deals/mine', otherCreator.cookie)).body)).toEqual([]);
    const mine = parseMine((await api.get('/api/deals/mine', creator.cookie)).body);
    expect(mine.map((i) => i.id).sort()).toEqual([deals.confirmed.id, deals.cancelled.id].sort());
    expect((await api.get('/api/deals/mine')).status).toBe(401);
    void brand;
  });
});

describe('GET /api/deals/mine: yourTurn and nextStep', () => {
  /** [status, applicants, record waiting for the creator] -> [next step, whose turn]. */
  const CASES: Array<[DealStatus, number, boolean, string | null, 'BRAND' | 'CREATOR' | null]> = [
    ['DRAFT', 0, false, 'PUBLISH', 'BRAND'],
    ['OPEN', 0, false, 'WAIT_FOR_APPLICANTS', null],
    ['OPEN', 2, false, 'CONFIRM_CREATOR', 'BRAND'],
    ['CONFIRMED', 1, false, 'PAY_FEE', 'BRAND'],
    ['COMMISSION_PAID', 1, false, 'PAY_ADVANCE', 'BRAND'],
    ['COMMISSION_PAID', 1, true, 'CONFIRM_PAYMENT', 'CREATOR'],
    ['ADVANCE_PAID', 1, false, 'UPLOAD_CONTENT', 'CREATOR'],
    ['CONTENT_UPLOADED', 1, false, 'REVIEW_CONTENT', 'BRAND'],
    ['REVISION_REQUESTED', 1, false, 'UPLOAD_CONTENT', 'CREATOR'],
    ['APPROVED', 1, false, 'PAY_FINAL', 'BRAND'],
    ['APPROVED', 1, true, 'CONFIRM_PAYMENT', 'CREATOR'],
    ['COMPLETED', 1, false, null, null],
    ['CANCELLED', 1, false, null, null],
  ];

  it.each(CASES)(
    '%s with %i applicants, record waiting %s: %s, turn of %s',
    async (status, applicants, waiting, nextStep, actor) => {
      const brand = await brandWithBilling();
      const creator = await creatorWithPayout();
      const hasCreator = status !== 'DRAFT' && status !== 'OPEN';
      const deal = await insertDeal(
        brand.user.id,
        status,
        hasCreator ? { creatorId: creator.user.id } : {},
      );
      for (let i = 0; i < applicants; i++) {
        const applicant = hasCreator && i === 0 ? creator : await creatorWithPayout();
        await insertApplication(
          deal.id,
          applicant.user.id,
          hasCreator && i === 0 ? 'CONFIRMED' : 'APPLIED',
        );
      }
      if (waiting) {
        await insertRecord(deal.id, brand.user.id, status === 'APPROVED' ? 'FINAL' : 'ADVANCE');
      }

      const [asBrand] = parseMine((await api.get('/api/deals/mine', brand.cookie)).body);
      expect(asBrand).toMatchObject({ nextStep, yourTurn: actor === 'BRAND' });
      if (hasCreator) {
        const [asCreator] = parseMine((await api.get('/api/deals/mine', creator.cookie)).body);
        expect(asCreator).toMatchObject({ nextStep, yourTurn: actor === 'CREATOR' });
      }
    },
  );

  it('a payment record that was refused, or already confirmed, is nobody waiting on the creator', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'COMMISSION_PAID', { creatorId: creator.user.id });
    await insertRecord(deal.id, brand.user.id, 'ADVANCE', {
      disputedAt: ago(HOUR),
      disputeReason: 'No',
    });
    // A record of the other stage does not count either.
    await insertRecord(deal.id, brand.user.id, 'FINAL');

    const [item] = parseMine((await api.get('/api/deals/mine', creator.cookie)).body);
    expect(item).toMatchObject({ nextStep: 'PAY_ADVANCE', yourTurn: false });
  });
});

describe('GET /api/deals/mine: what each role also gets', () => {
  it('a creator sees what has been received so far: confirmed payments only, never the fee', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'APPROVED', { creatorId: creator.user.id });
    const advance = await insertRecord(deal.id, brand.user.id, 'ADVANCE', {
      confirmedAt: ago(2 * HOUR),
      confirmedBy: creator.user.id,
    });
    // A refused attempt and a payment still waiting are not received.
    await insertRecord(deal.id, brand.user.id, 'ADVANCE', {
      disputedAt: ago(5 * HOUR),
      disputeReason: 'Nothing arrived',
    });
    await insertRecord(deal.id, brand.user.id, 'FINAL');
    const bare = await insertDeal(brand.user.id, 'CONFIRMED', { creatorId: creator.user.id });

    const items = parseMine((await api.get('/api/deals/mine', creator.cookie)).body);
    const byId = Object.fromEntries(items.map((i) => [i.id, i.receivedPaise]));
    expect(byId[deal.id]).toBe(advance.amountPaise);
    expect(byId[bare.id]).toBe(0);
  });

  it('a creator gets none of the brand fields, and a brand none of the creator one', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });

    const [asCreator] = parseMine((await api.get('/api/deals/mine', creator.cookie)).body);
    expect(asCreator).toMatchObject({
      applicantCount: null,
      applicationsOpen: null,
      creator: null,
    });
    const [asBrand] = parseMine((await api.get('/api/deals/mine', brand.cookie)).body);
    expect(asBrand?.receivedPaise).toBeNull();
  });

  it('a brand sees the applicants, whether applications are open, and the confirmed creator', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const open = await insertDeal(brand.user.id, 'OPEN');
    const closed = await insertDeal(brand.user.id, 'OPEN', { applicationDeadline: '2026-10-08' });
    const confirmed = await insertDeal(brand.user.id, 'CONFIRMED', { creatorId: creator.user.id });
    await insertApplication(open.id, (await creatorWithPayout()).user.id);
    await insertApplication(open.id, (await creatorWithPayout()).user.id);
    await insertApplication(open.id, (await creatorWithPayout()).user.id, 'REJECTED');
    await insertApplication(confirmed.id, creator.user.id, 'CONFIRMED');

    const byId = Object.fromEntries(
      parseMine((await api.get('/api/deals/mine', brand.cookie)).body).map((i) => [i.id, i]),
    );
    expect(byId[open.id]).toMatchObject({
      applicantCount: 3,
      applicationsOpen: true,
      creator: null,
    });
    expect(byId[closed.id]).toMatchObject({ applicantCount: 0, applicationsOpen: false });
    expect(byId[confirmed.id]).toMatchObject({
      applicantCount: 1,
      applicationsOpen: false,
      creator: { id: creator.user.id, username: creator.user.username },
    });
  });

  it('both roles see when and how a deal ended', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const cancelled = await insertDeal(brand.user.id, 'CANCELLED', {
      creatorId: creator.user.id,
      cancelledAt: ago(HOUR),
      cancelledByRole: 'ADMIN',
      cancellationReason: 'Creator stopped responding',
    });
    const done = await insertDeal(brand.user.id, 'COMPLETED', {
      creatorId: creator.user.id,
      completedAt: ago(2 * HOUR),
    });
    const open = await insertDeal(brand.user.id, 'OPEN');

    for (const who of [brand, creator]) {
      const byId = Object.fromEntries(
        parseMine((await api.get('/api/deals/mine', who.cookie)).body).map((i) => [i.id, i]),
      );
      expect(byId[cancelled.id]).toMatchObject({
        cancelledAt: ago(HOUR).toISOString(),
        cancelledByRole: 'ADMIN',
        cancellationReason: 'Creator stopped responding',
        completedAt: null,
      });
      expect(byId[done.id]).toMatchObject({
        completedAt: ago(2 * HOUR).toISOString(),
        cancelledAt: null,
        cancelledByRole: null,
        cancellationReason: null,
      });
      if (who === brand) {
        expect(byId[open.id]).toMatchObject({ completedAt: null, cancelledAt: null });
      }
    }
  });
});
