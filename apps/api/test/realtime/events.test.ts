import {
  FEED_ROOM,
  applicationNewPayloadSchema,
  dealNewPayloadSchema,
  dealRoom,
  dealStatusPayloadSchema,
  userRoom,
  computeBreakdown,
} from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { deals } from '../../src/db/schema/index.js';
import { setRealtime } from '../../src/realtime/emitter.js';
import { adminUser } from '../admin/helpers.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  READY_DRAFT,
  brandWithBilling,
  creatorWithPayout,
  insertApplication,
  insertDeal,
} from '../helpers/deals.js';
import { DRIVE_LINK, runDeal } from '../helpers/lifecycle.js';
import { verifyBody } from '../helpers/payments.js';
import {
  confirmPayment,
  dealWithOrder,
  notReceived,
  razorpayCaptured,
  recordPayment,
} from '../payments/fixture.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';
import { QUIET_MS, sleep, startHarness, type Harness } from './helpers.js';

const msw = setupServer();
let razorpay: OrdersMockState;
let h: Harness;
let emitted: Array<{ room: string; event: string; payload: unknown }>;
/** `deal:summary` is kept apart, so the room events above stay exact; its own tests read this. */
let summaries: Array<{ room: string; payload: unknown }>;

beforeAll(async () => {
  msw.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
  razorpay = newOrdersState();
  msw.use(...ordersHandlers(razorpay));
  h = await startHarness({
    now: () => NOW,
    razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} },
  });
});
afterEach(async () => {
  msw.resetHandlers();
  await h.stop();
});
afterAll(async () => {
  msw.close();
  await closeDb();
});

/** Replaces the Socket.io emitter with one that records, so counts are exact and need no waiting. */
function record() {
  emitted = [];
  summaries = [];
  setRealtime({
    emit: (room, event, payload) => {
      if (event === 'deal:summary') summaries.push({ room, payload });
      else emitted.push({ room, event, payload });
    },
  });
  return emitted;
}
const named = (event: string) => emitted.filter((e) => e.event === event);
const statuses = (event: string) =>
  named(event).map((e) => (e.payload as { status: string }).status);

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

describe('publishing', () => {
  it('sends deal:new to the creators feed and deal:updated to the deal room, once each', async () => {
    record();
    const brand = await brandWithBilling();
    const created = await h.call.send('post', '/api/deals', brand.cookie, READY_DRAFT);
    const id = created.body.deal.id as string;
    expect(emitted).toEqual([]); // a draft is nobody else's business

    const res = await h.call.send('post', `/api/deals/${id}/publish`, brand.cookie, {});
    expect(res.status).toBe(200);

    expect(named('deal:updated')).toEqual([
      { room: dealRoom(id), event: 'deal:updated', payload: { id, status: 'OPEN' } },
    ]);
    expect(named('deal:closed')).toEqual([]);
    const [dealNew] = named('deal:new');
    expect(named('deal:new')).toHaveLength(1);
    expect(dealNew?.room).toBe(FEED_ROOM);
    const payload = dealNewPayloadSchema.parse(dealNew?.payload);
    expect(payload).toEqual({
      id,
      title: READY_DRAFT.title,
      brand: { username: brand.user.username, profilePictureUrl: null },
      budgetPaise: 1_000_000,
      creatorAmountPaise: computeBreakdown(1_000_000, 0).creatorAmountPaise,
      applicationDeadline: READY_DRAFT.applicationDeadline,
      contentUploadDeadline: READY_DRAFT.contentUploadDeadline,
    });
    // Nothing private: exactly the SPEC 10 keys.
    expect(Object.keys(dealNew?.payload as object).sort()).toEqual([
      'applicationDeadline',
      'brand',
      'budgetPaise',
      'contentUploadDeadline',
      'creatorAmountPaise',
      'id',
      'title',
    ]);
  });

  it('a draft edit and a draft delete send nothing', async () => {
    record();
    const brand = await brandWithBilling();
    const id = (await h.call.send('post', '/api/deals', brand.cookie, READY_DRAFT)).body.deal.id;
    await h.call.send('patch', `/api/deals/${id}`, brand.cookie, { title: 'New title' });
    await h.call.send('delete', `/api/deals/${id}`, brand.cookie);
    expect(emitted).toEqual([]);
  });

  it('a publish that fails sends nothing', async () => {
    record();
    const brand = await brandWithBilling();
    const id = (await h.call.send('post', '/api/deals', brand.cookie, { title: 'Half done' })).body
      .deal.id;
    const res = await h.call.send('post', `/api/deals/${id}/publish`, brand.cookie, {});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(emitted).toEqual([]);
  });
});

describe('applications', () => {
  it('sends application:new to the deal brand only, with ids and nothing about the creator', async () => {
    record();
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'OPEN');

    const res = await h.call.send('post', `/api/deals/${deal.id}/applications`, creator.cookie, {});
    expect(res.status).toBe(201);

    expect(emitted).toEqual([
      {
        room: userRoom(brand.user.id),
        event: 'application:new',
        payload: { dealId: deal.id, applicationId: res.body.application.id },
      },
    ]);
    applicationNewPayloadSchema.parse(emitted[0]?.payload);
  });

  it('a second application from the same creator, and a refused one, send nothing more', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const noPayout = await creatorWithPayout(null);
    const deal = await insertDeal(brand.user.id, 'OPEN');
    await h.call.send('post', `/api/deals/${deal.id}/applications`, creator.cookie, {});
    record();

    const again = await h.call.send(
      'post',
      `/api/deals/${deal.id}/applications`,
      creator.cookie,
      {},
    );
    const refused = await h.call.send(
      'post',
      `/api/deals/${deal.id}/applications`,
      noPayout.cookie,
      {},
    );

    expect([again.status, refused.status]).toEqual([409, 403]);
    expect(emitted).toEqual([]);
  });

  it('confirming sends deal:closed to the feed and deal:updated to the deal room, once each', async () => {
    const { brand, deal, apps } = await openDealWithApplicants(3);
    record();

    const res = await h.call.send(
      'post',
      `/api/applications/${apps[1]!.id}/confirm`,
      brand.cookie,
      {},
    );
    expect(res.status).toBe(200);

    expect(emitted).toEqual([
      {
        room: dealRoom(deal.id),
        event: 'deal:updated',
        payload: { id: deal.id, status: 'CONFIRMED' },
      },
      { room: FEED_ROOM, event: 'deal:closed', payload: { id: deal.id, status: 'CONFIRMED' } },
    ]);
  });

  it('two confirms at once make one transition and so one set of events', async () => {
    const { brand, apps } = await openDealWithApplicants(2);
    record();

    const results = await Promise.all([
      h.call.send('post', `/api/applications/${apps[0]!.id}/confirm`, brand.cookie, {}),
      h.call.send('post', `/api/applications/${apps[1]!.id}/confirm`, brand.cookie, {}),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(named('deal:updated')).toHaveLength(1);
    expect(named('deal:closed')).toHaveLength(1);
  });
});

describe('cancelling', () => {
  it('from OPEN: deal:closed and deal:updated. From CONFIRMED: deal:updated only', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const open = await insertDeal(brand.user.id, 'OPEN');
    const confirmed = await insertDeal(brand.user.id, 'CONFIRMED', { creatorId: creator.user.id });
    record();

    await h.call.send('post', `/api/deals/${open.id}/cancel`, brand.cookie, {
      reason: 'Plans changed',
    });
    expect(named('deal:updated')).toHaveLength(1);
    expect(named('deal:closed')).toEqual([
      { room: FEED_ROOM, event: 'deal:closed', payload: { id: open.id, status: 'CANCELLED' } },
    ]);

    emitted.length = 0;
    await h.call.send('post', `/api/deals/${confirmed.id}/cancel`, brand.cookie, {
      reason: 'Plans changed',
    });
    expect(emitted).toEqual([
      {
        room: dealRoom(confirmed.id),
        event: 'deal:updated',
        payload: { id: confirmed.id, status: 'CANCELLED' },
      },
    ]);
  });

  it('a refused cancel (the fee is paid) sends nothing', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'COMMISSION_PAID', { creatorId: creator.user.id });
    record();

    const res = await h.call.send('post', `/api/deals/${deal.id}/cancel`, brand.cookie, {
      reason: 'x',
    });

    expect(res.status).toBe(409);
    expect(emitted).toEqual([]);
  });

  it('an admin cancel sends one deal:updated', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const admin = await adminUser();
    const deal = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });
    record();

    const res = await h.call.send('post', `/api/admin/deals/${deal.id}/cancel`, admin.cookie, {
      note: 'Creator stopped responding',
    });

    expect(res.status).toBe(200);
    expect(emitted).toEqual([
      {
        room: dealRoom(deal.id),
        event: 'deal:updated',
        payload: { id: deal.id, status: 'CANCELLED' },
      },
    ]);
  });
});

describe('content review', () => {
  it('sends one deal:updated for every upload, feedback and approval', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });
    record();

    await h.call.send('post', `/api/deals/${deal.id}/content`, creator.cookie, {
      link: DRIVE_LINK,
    });
    await h.call.send('post', `/api/deals/${deal.id}/feedback`, brand.cookie, {
      feedback: 'Reshoot',
    });
    await h.call.send('post', `/api/deals/${deal.id}/content`, creator.cookie, {
      link: `${DRIVE_LINK}2`,
    });
    await h.call.send('post', `/api/deals/${deal.id}/approve`, brand.cookie, {});

    expect(statuses('deal:updated')).toEqual([
      'CONTENT_UPLOADED',
      'REVISION_REQUESTED',
      'CONTENT_UPLOADED',
      'APPROVED',
    ]);
    expect(emitted.every((e) => e.room === dealRoom(deal.id))).toBe(true);
  });
});

describe('payments', () => {
  it('the fee sends one deal:updated whether verify runs once or twice', async () => {
    const f = await dealWithOrder(h.call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    record();

    for (let i = 0; i < 2; i++) {
      const res = await h.call.send(
        'post',
        '/api/payments/verify',
        f.brand.cookie,
        verifyBody(f.orderId, paymentId),
      );
      expect(res.status).toBe(200);
    }

    expect(emitted).toEqual([
      {
        room: dealRoom(f.deal.id),
        event: 'deal:updated',
        payload: { id: f.deal.id, status: 'COMMISSION_PAID' },
      },
    ]);
  });

  it('a whole deal sends one deal:updated per transition and per payment record, and no feed events', async () => {
    record();
    const { deal } = await runDeal(h.call, razorpay, 'COMPLETED');

    expect(statuses('deal:updated')).toEqual([
      'COMMISSION_PAID', // the fee
      'COMMISSION_PAID', // the advance recorded
      'ADVANCE_PAID', // the advance confirmed
      'CONTENT_UPLOADED',
      'APPROVED',
      'APPROVED', // the final recorded
      'COMPLETED', // the final confirmed
    ]);
    expect(named('deal:updated').every((e) => e.room === dealRoom(deal.id))).toBe(true);
    expect(named('deal:new')).toEqual([]);
    expect(named('deal:closed')).toEqual([]);
  });

  it('every payload is only an id and a status: no UPI ID, reference or email anywhere', async () => {
    record();
    await runDeal(h.call, razorpay, 'COMPLETED');

    for (const event of named('deal:updated')) dealStatusPayloadSchema.parse(event.payload);
    const text = JSON.stringify(emitted);
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/okaxis|UTR|payer/i);
  });
});

describe('failure handling', () => {
  it('an emitter that throws never fails the request or undoes the transition', async () => {
    setRealtime({
      emit: () => {
        throw new Error('socket server exploded');
      },
    });
    const { brand, deal, apps } = await openDealWithApplicants(1);

    const res = await h.call.send(
      'post',
      `/api/applications/${apps[0]!.id}/confirm`,
      brand.cookie,
      {},
    );

    expect(res.status).toBe(200);
    const [after] = await db.select().from(deals).where(eq(deals.id, deal.id));
    expect(after?.status).toBe('CONFIRMED');
  });
});

describe('over real sockets', () => {
  it('a record, a not-received and a confirm each reach the brand and the creator, and no one else', async () => {
    const { brand, creator, deal } = await runDeal(h.call, razorpay, 'COMMISSION_PAID');
    const stranger = await brandWithBilling();
    const otherCreator = await creatorWithPayout();

    const brandClient = await h.open({ cookie: brand.cookie });
    const creatorClient = await h.open({ cookie: creator.cookie });
    const strangerClient = await h.open({ cookie: stranger.cookie });
    const otherCreatorClient = await h.open({ cookie: otherCreator.cookie });
    expect(await brandClient.join(deal.id)).toEqual({ ok: true });
    expect(await creatorClient.join(deal.id)).toEqual({ ok: true });
    expect(await strangerClient.join(deal.id)).toEqual({ ok: false });
    expect(await otherCreatorClient.join(deal.id)).toEqual({ ok: false });

    // What each client does on an event: refetch over REST, as SPEC 10 says.
    const seen: Record<string, string[]> = { brand: [], creator: [] };
    brandClient.socket.on('deal:updated', async () => {
      seen.brand!.push((await h.call.get(`/api/deals/${deal.id}`, brand.cookie)).body.deal.status);
    });
    creatorClient.socket.on('deal:updated', async () => {
      seen.creator!.push(
        (await h.call.get(`/api/deals/${deal.id}`, creator.cookie)).body.deal.status,
      );
    });

    // 1. The brand records the advance.
    const recorded = await recordPayment(h.call, brand, deal.id, 'ADVANCE');
    expect(recorded.status).toBe(201);
    await sleep(QUIET_MS);
    expect(brandClient.of('deal:updated')).toEqual([{ id: deal.id, status: 'COMMISSION_PAID' }]);
    expect(creatorClient.of('deal:updated')).toEqual([{ id: deal.id, status: 'COMMISSION_PAID' }]);

    // 2. The creator says it did not arrive: the status is unchanged but both refetch.
    const marked = await notReceived(h.call, creator, recorded.body.directPayment.id);
    expect(marked.status).toBe(200);
    await sleep(QUIET_MS);
    expect(brandClient.of('deal:updated')).toHaveLength(2);
    expect(creatorClient.of('deal:updated')).toHaveLength(2);

    // 3. The brand records again and the creator confirms: the deal moves.
    const second = await recordPayment(h.call, brand, deal.id, 'ADVANCE', 'UTRSECOND999');
    expect(second.status).toBe(201);
    await sleep(QUIET_MS);
    const confirmed = await confirmPayment(h.call, creator, second.body.directPayment.id);
    expect(confirmed.status).toBe(200);
    await sleep(QUIET_MS);

    const expected = [
      { id: deal.id, status: 'COMMISSION_PAID' },
      { id: deal.id, status: 'COMMISSION_PAID' },
      { id: deal.id, status: 'COMMISSION_PAID' },
      { id: deal.id, status: 'ADVANCE_PAID' },
    ];
    expect(brandClient.of('deal:updated')).toEqual(expected);
    expect(creatorClient.of('deal:updated')).toEqual(expected);
    // The commit is visible by the time the event lands: the refetch sees the new status.
    expect(seen.brand!.at(-1)).toBe('ADVANCE_PAID');
    expect(seen.creator!.at(-1)).toBe('ADVANCE_PAID');
    // Strangers heard nothing at all.
    expect(strangerClient.received).toEqual([]);
    expect(
      otherCreatorClient.received.filter(
        (r) => r.event !== 'deal:new' && r.event !== 'deal:closed',
      ),
    ).toEqual([]);
  });

  it('publishing reaches onboarded creators with deal:new and not brands or unfinished creators', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const otherBrand = await brandWithBilling();
    const creatorClient = await h.open({ cookie: creator.cookie });
    const brandClient = await h.open({ cookie: brand.cookie });
    const otherBrandClient = await h.open({ cookie: otherBrand.cookie });
    const id = (await h.call.send('post', '/api/deals', brand.cookie, READY_DRAFT)).body.deal.id;

    await h.call.send('post', `/api/deals/${id}/publish`, brand.cookie, {});
    await sleep(QUIET_MS);

    expect(creatorClient.of('deal:new')).toHaveLength(1);
    expect(dealNewPayloadSchema.parse(creatorClient.of('deal:new')[0]).id).toBe(id);
    expect(brandClient.of('deal:new')).toEqual([]);
    expect(otherBrandClient.of('deal:new')).toEqual([]);
  });

  it('deal:closed reaches the feed when a creator is confirmed, and application:new reaches the brand only', async () => {
    const brand = await brandWithBilling();
    const otherBrand = await brandWithBilling();
    const applicant = await creatorWithPayout();
    const bystander = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'OPEN');

    const brandClient = await h.open({ cookie: brand.cookie });
    const otherBrandClient = await h.open({ cookie: otherBrand.cookie });
    const applicantClient = await h.open({ cookie: applicant.cookie });
    const bystanderClient = await h.open({ cookie: bystander.cookie });

    const applied = await h.call.send(
      'post',
      `/api/deals/${deal.id}/applications`,
      applicant.cookie,
      {},
    );
    await sleep(QUIET_MS);
    expect(brandClient.of('application:new')).toEqual([
      { dealId: deal.id, applicationId: applied.body.application.id },
    ]);
    expect(otherBrandClient.of('application:new')).toEqual([]);
    expect(applicantClient.of('application:new')).toEqual([]);
    expect(bystanderClient.of('application:new')).toEqual([]);

    await h.call.send(
      'post',
      `/api/applications/${applied.body.application.id}/confirm`,
      brand.cookie,
      {},
    );
    await sleep(QUIET_MS);
    // The feed (every onboarded creator) hears the deal closed; the brands do not.
    expect(applicantClient.of('deal:closed')).toEqual([{ id: deal.id, status: 'CONFIRMED' }]);
    expect(bystanderClient.of('deal:closed')).toEqual([{ id: deal.id, status: 'CONFIRMED' }]);
    expect(brandClient.of('deal:closed')).toEqual([]);
    expect(otherBrandClient.received).toEqual([]);
  });
});

describe('disputes', () => {
  const raise = (cookie: string, dealId: string) =>
    h.call.send('post', `/api/deals/${dealId}/disputes`, cookie, {
      subject: 'Late delivery',
      description: 'The content is two weeks late and the reply was rude.',
    });

  it('raising and resolving each send one deal:updated to the deal room, with the unchanged status', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const admin = await adminUser();
    const deal = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });
    record();

    const raised = await raise(creator.cookie, deal.id);
    expect(raised.status).toBe(201);
    expect(emitted).toEqual([
      {
        room: dealRoom(deal.id),
        event: 'deal:updated',
        payload: { id: deal.id, status: 'ADVANCE_PAID' },
      },
    ]);

    emitted.length = 0;
    const resolved = await h.call.send(
      'post',
      `/api/admin/disputes/${raised.body.dispute.id}/resolve`,
      admin.cookie,
      { resolution: 'Settled between the parties' },
    );
    expect(resolved.status).toBe(200);
    expect(emitted).toEqual([
      {
        room: dealRoom(deal.id),
        event: 'deal:updated',
        payload: { id: deal.id, status: 'ADVANCE_PAID' },
      },
    ]);
    expect(JSON.stringify(emitted)).not.toContain('two weeks late');
  });

  it('a refused raise (second open dispute, stranger) sends nothing', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const stranger = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });
    expect((await raise(brand.cookie, deal.id)).status).toBe(201);
    record();

    expect((await raise(creator.cookie, deal.id)).status).toBe(409);
    expect((await raise(stranger.cookie, deal.id)).status).toBe(404);
    expect(emitted).toEqual([]);
  });

  it('over real sockets, both parties get the event and refetch the dispute; a stranger gets nothing', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const stranger = await brandWithBilling();
    const deal = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });
    const brandClient = await h.open({ cookie: brand.cookie });
    const creatorClient = await h.open({ cookie: creator.cookie });
    const strangerClient = await h.open({ cookie: stranger.cookie });
    expect(await brandClient.join(deal.id)).toEqual({ ok: true });
    expect(await creatorClient.join(deal.id)).toEqual({ ok: true });
    expect(await strangerClient.join(deal.id)).toEqual({ ok: false });

    expect((await raise(creator.cookie, deal.id)).status).toBe(201);
    await sleep(QUIET_MS);

    expect(brandClient.of('deal:updated')).toEqual([{ id: deal.id, status: 'ADVANCE_PAID' }]);
    expect(creatorClient.of('deal:updated')).toEqual([{ id: deal.id, status: 'ADVANCE_PAID' }]);
    expect(strangerClient.of('deal:updated')).toEqual([]);
    const refetched = await h.call.get(`/api/deals/${deal.id}`, brand.cookie);
    expect(refetched.body.deal.disputes).toHaveLength(1);
  });
});

describe('deal:summary to the two parties (SPEC 10)', () => {
  const summaryRooms = (dealId: string) =>
    summaries
      .filter((e) => (e.payload as { id: string }).id === dealId)
      .map((e) => e.room)
      .sort();

  it('reaches the brand and the confirmed creator on every transition, and no one else', async () => {
    const { brand, creator, deal } = await runDeal(h.call, razorpay, 'ADVANCE_PAID');
    record();
    const res = await h.call.send('post', `/api/deals/${deal.id}/content`, creator.cookie, {
      link: DRIVE_LINK,
    });
    expect(res.status).toBe(200);
    expect(summaryRooms(deal.id)).toEqual(
      [userRoom(brand.user.id), userRoom(creator.user.id)].sort(),
    );
    expect(summaries.every((e) => dealStatusPayloadSchema.safeParse(e.payload).success)).toBe(true);
    expect((summaries[0]!.payload as { status: string }).status).toBe('CONTENT_UPLOADED');
  });

  it('reaches only the brand while no creator is confirmed', async () => {
    const brand = await brandWithBilling();
    const applicant = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'OPEN');
    await insertApplication(deal.id, applicant.user.id);
    record();
    const res = await h.call.send('post', `/api/deals/${deal.id}/cancel`, brand.cookie, {
      reason: 'Plans changed',
    });
    expect(res.status).toBe(200);
    expect(summaryRooms(deal.id)).toEqual([userRoom(brand.user.id)]);
  });

  it('is sent when a direct payment is recorded and when it is marked not received', async () => {
    const first = await dealWithOrder(h.call, 'commission');
    const paymentId = razorpayCaptured(razorpay, first, 'commission', { paymentId: 'pay_sum1' });
    await h.call.send(
      'post',
      '/api/payments/verify',
      first.brand.cookie,
      verifyBody(first.orderId, paymentId),
    );
    const parties = [userRoom(first.brand.user.id), userRoom(first.creator.user.id)].sort();

    record();
    const recorded = await recordPayment(h.call, first.brand, first.deal.id, 'ADVANCE');
    expect(recorded.status).toBe(201);
    expect(summaryRooms(first.deal.id)).toEqual(parties);

    record();
    await notReceived(h.call, first.creator, recorded.body.directPayment.id);
    expect(summaryRooms(first.deal.id)).toEqual(parties);
  });
});
