import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { sessions } from '../../src/db/schema/index.js';
import { emitDealUpdated } from '../../src/realtime/events.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { adminUser } from '../admin/helpers.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  insertApplication,
  insertDeal,
} from '../helpers/deals.js';
import { QUIET_MS, sleep, startHarness, type Harness } from './helpers.js';

let h: Harness;
let clock = NOW;

beforeAll(resetDb);
beforeEach(async () => {
  await truncateAll();
  clock = NOW;
  h = await startHarness({ now: () => clock });
});
afterEach(async () => {
  await h.stop();
});
afterAll(closeDb);

async function confirmedDeal() {
  const brand = await brandWithBilling();
  const creator = await creatorWithPayout();
  const deal = await insertDeal(brand.user.id, 'COMMISSION_PAID', { creatorId: creator.user.id });
  return { brand, creator, deal };
}

describe('who may join a deal room', () => {
  it('lets the brand, the confirmed creator and an admin in', async () => {
    const { brand, creator, deal } = await confirmedDeal();
    const admin = await adminUser();

    for (const who of [brand, creator, admin]) {
      const client = await h.open({ cookie: who.cookie });
      expect(await client.join(deal.id)).toEqual({ ok: true });
    }
  });

  it('keeps strangers out, with the same answer for every kind of refusal', async () => {
    const { deal } = await confirmedDeal();
    const otherBrand = await brandWithBilling();
    const otherCreator = await creatorWithPayout();
    const applicant = await creatorWithPayout();
    await insertApplication(deal.id, applicant.user.id, 'REJECTED');

    const refused = [];
    for (const who of [otherBrand, otherCreator, applicant]) {
      const client = await h.open({ cookie: who.cookie });
      refused.push(await client.join(deal.id));
    }
    const probe = await h.open({ cookie: otherBrand.cookie });
    refused.push(await probe.join('01a0e8e8-52b5-75d3-999f-4570bcd490e4')); // no such deal

    expect(refused).toEqual([{ ok: false }, { ok: false }, { ok: false }, { ok: false }]);
  });

  it('keeps out a creator who only applied to an OPEN deal, which REST shows them', async () => {
    const brand = await brandWithBilling();
    const applicant = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    await insertApplication(deal.id, applicant.user.id);

    // REST lets any signed-in user see an OPEN deal; the room is only for its participants.
    const viaRest = await h.call.get(`/api/deals/${deal.id}`, applicant.cookie);
    expect(viaRest.status).toBe(200);
    const client = await h.open({ cookie: applicant.cookie });
    expect(await client.join(deal.id)).toEqual({ ok: false });
  });

  it('lets the brand of an OPEN deal in, before any creator is confirmed', async () => {
    const brand = await brandWithBilling();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    const client = await h.open({ cookie: brand.cookie });
    expect(await client.join(deal.id)).toEqual({ ok: true });
  });

  it('delivers deal events to the room and not to a stranger', async () => {
    const { brand, creator, deal } = await confirmedDeal();
    const stranger = await creatorWithPayout();
    const inRoom = await h.open({ cookie: brand.cookie });
    const alsoIn = await h.open({ cookie: creator.cookie });
    const outside = await h.open({ cookie: stranger.cookie });
    await inRoom.join(deal.id);
    await alsoIn.join(deal.id);
    await outside.join(deal.id); // refused

    emitDealUpdated({ id: deal.id, status: 'COMMISSION_PAID' });
    await sleep(QUIET_MS);

    expect(inRoom.of('deal:updated')).toEqual([{ id: deal.id, status: 'COMMISSION_PAID' }]);
    expect(alsoIn.of('deal:updated')).toHaveLength(1);
    expect(outside.of('deal:updated')).toEqual([]);
  });

  it('stops delivering after deal:leave', async () => {
    const { brand, deal } = await confirmedDeal();
    const client = await h.open({ cookie: brand.cookie });
    await client.join(deal.id);
    expect(await client.leave(deal.id)).toEqual({ ok: true });

    emitDealUpdated({ id: deal.id, status: 'COMMISSION_PAID' });
    await sleep(QUIET_MS);
    expect(client.of('deal:updated')).toEqual([]);
  });

  it('a creator who is not confirmed yet cannot join, and can once they are', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    await insertApplication(deal.id, creator.user.id);
    const client = await h.open({ cookie: creator.cookie });
    expect(await client.join(deal.id)).toEqual({ ok: false });

    await h.call.send(
      'post',
      '/api/applications/' + (await applicationId(deal.id)) + '/confirm',
      brand.cookie,
      {},
    );

    expect(await client.join(deal.id)).toEqual({ ok: true });
  });
});

async function applicationId(dealId: string): Promise<string> {
  const rows = await db.query.applications.findMany({
    where: (a, { eq: equals }) => equals(a.dealId, dealId),
  });
  return rows[0]!.id;
}

describe('what a join request must look like', () => {
  it.each([
    ['nothing', undefined],
    ['a string', 'deal:x'],
    ['no deal id', {}],
    ['an id that is not a UUID', { dealId: 'nope' }],
    ['a number', { dealId: 5 }],
    ['extra fields', { dealId: '01a0e8e8-52b5-75d3-999f-4570bcd490e4', room: 'feed:creators' }],
    ['a room name', { dealId: 'feed:creators' }],
  ])('answers ok: false for %s', async (_label, payload) => {
    const { brand } = await confirmedDeal();
    const client = await h.open({ cookie: brand.cookie });
    expect(await client.joinRaw(payload)).toEqual({ ok: false });
  });

  it('answers a join with no acknowledgement callback without crashing the socket', async () => {
    const { brand, deal } = await confirmedDeal();
    const client = await h.open({ cookie: brand.cookie });
    client.socket.emit('deal:join', { dealId: deal.id });
    await sleep(QUIET_MS);
    expect(client.socket.connected).toBe(true);
    emitDealUpdated({ id: deal.id, status: 'COMMISSION_PAID' });
    await sleep(QUIET_MS);
    expect(client.of('deal:updated')).toHaveLength(1);
  });
});

describe('the session is checked again at join', () => {
  it('refuses a join after the session was deleted, and disconnects the socket', async () => {
    const { brand, deal } = await confirmedDeal();
    const client = await h.open({ cookie: brand.cookie });
    const gone = new Promise((resolve) => client.socket.once('disconnect', resolve));

    await db.delete(sessions).where(eq(sessions.userId, brand.user.id));

    expect(await client.join(deal.id)).toEqual({ ok: false });
    await gone;
    expect(client.socket.connected).toBe(false);
  });
});

describe('limits', () => {
  it('holds at most 50 deal rooms per socket', async () => {
    const brand = await brandWithBilling();
    const client = await h.open({ cookie: brand.cookie });
    const ids: string[] = [];
    for (let i = 0; i < 51; i++) ids.push((await insertDeal(brand.user.id, 'OPEN')).id);

    // 30 joins a minute, so the clock moves on a minute after each 30.
    const answers = [];
    for (const [index, id] of ids.entries()) {
      if (index > 0 && index % 30 === 0) clock = new Date(clock.getTime() + 61_000);
      answers.push(await client.join(id));
    }

    expect(answers.slice(0, 50).every((a) => (a as { ok: boolean }).ok)).toBe(true);
    expect(answers[50]).toEqual({ ok: false });
    // A room it already holds is still fine.
    expect(await client.join(ids[0]!)).toEqual({ ok: true });
  });

  it('allows 30 join requests a minute per socket', async () => {
    const brand = await brandWithBilling();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    const client = await h.open({ cookie: brand.cookie });

    const answers = [];
    for (let i = 0; i < 31; i++) answers.push(await client.join(deal.id));

    expect(answers.slice(0, 30).every((a) => (a as { ok: boolean }).ok)).toBe(true);
    expect(answers[30]).toEqual({ ok: false });

    clock = new Date(NOW.getTime() + 61_000);
    expect(await client.join(deal.id)).toEqual({ ok: true });
  });
});
