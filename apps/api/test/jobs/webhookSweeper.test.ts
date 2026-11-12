import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { emailLog, invoices, webhookEvents } from '../../src/db/schema/index.js';
import { createWebhookSweeperJob, webhookSweeperJob } from '../../src/jobs/webhookSweeper.js';
import { runJob } from '../../src/jobs/runJob.js';
import { redactWebhookPayload } from '../../src/webhooks/redact.js';
import type { WebhookHandlerRegistry } from '../../src/webhooks/types.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, http as api } from '../helpers/deals.js';
import { deliverWebhook, paymentCapturedEvent } from '../helpers/payments.js';
import { buildTestEnv } from '../testEnv.js';
import { dealState, dealWithOrder, emails, razorpayCaptured } from '../payments/fixture.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';
import { jobCtx } from './helpers.js';

const MINUTE = 60 * 1000;
const env = buildTestEnv();
const app = createApp(env, {
  now: () => NOW,
  razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} },
});
const call = api(app);
const server = setupServer();
let razorpay: OrdersMockState;

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
  razorpay = newOrdersState();
  server.use(...ordersHandlers(razorpay));
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await closeDb();
});

/** Stores an event the way the route does, received `ageMs` before NOW. */
async function store(
  id: string,
  ageMs: number,
  extra: Partial<typeof webhookEvents.$inferInsert> = {},
  eventType = 'test.event',
  payload: object = { event: eventType, payload: { id } },
) {
  await db.insert(webhookEvents).values({
    id,
    eventType,
    payload: redactWebhookPayload(payload) as Record<string, unknown>,
    receivedAt: new Date(NOW.getTime() - ageMs),
    ...extra,
  });
}

const rowOf = async (id: string) =>
  (await db.select().from(webhookEvents).where(eq(webhookEvents.id, id)))[0]!;

/** Handlers that record the payloads they are given. */
function recordingHandlers(options: { failOn?: string; delayMs?: number } = {}) {
  const seen: string[] = [];
  const handlers: WebhookHandlerRegistry = {
    'test.event': async (payload) => {
      const id = (payload as { payload: { id: string } }).payload.id;
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      if (id === options.failOn) throw new Error(`handler failed for ${id}`);
      seen.push(id);
    },
  };
  return { seen, job: createWebhookSweeperJob(() => handlers) };
}

describe('webhook-sweeper', () => {
  it('processes an event that was stored and never processed, and marks it', async () => {
    await store('evt_stuck', 10 * MINUTE);
    const { seen, job } = recordingHandlers();

    const result = await runJob(job, jobCtx(NOW));

    expect(result).toMatchObject({
      job: 'webhook-sweeper',
      status: 'ok',
      counts: { selected: 1, processed: 1, failedEvents: 0 },
    });
    expect(seen).toEqual(['evt_stuck']);
    const row = await rowOf('evt_stuck');
    expect(row.processedAt).not.toBeNull();
    expect(row.error).toBeNull();
  });

  it('leaves a fresh event, a processed event and a failed event alone', async () => {
    await store('evt_fresh', 119_000);
    await store('evt_exactly_two_minutes', 2 * MINUTE);
    await store('evt_done', 20 * MINUTE, { processedAt: new Date(NOW.getTime() - 19 * MINUTE) });
    await store('evt_failed', 20 * MINUTE, { error: 'Payment amount mismatch details' });
    const { seen, job } = recordingHandlers();

    const result = await runJob(job, jobCtx(NOW));

    // Exactly 2 minutes old is not "more than 2 minutes", so it waits for the next run.
    expect(result.counts).toMatchObject({ selected: 0, processed: 0, failedEvents: 0 });
    expect(seen).toEqual([]);
    expect((await rowOf('evt_fresh')).processedAt).toBeNull();
    expect((await rowOf('evt_exactly_two_minutes')).processedAt).toBeNull();
    expect(await rowOf('evt_failed')).toMatchObject({
      processedAt: null,
      error: 'Payment amount mismatch details',
    });
    expect(await emails('ADMIN_ALERT')).toHaveLength(0);

    // A second later the one that was exactly 2 minutes old is more than 2 minutes old.
    const later = await runJob(job, jobCtx(new Date(NOW.getTime() + 1000)));
    expect(later.counts).toMatchObject({ selected: 1, processed: 1 });
    expect(seen).toEqual(['evt_exactly_two_minutes']);
  });

  it('takes the oldest first, at most 50 a run, and the rest on the next run', async () => {
    for (let i = 0; i < 55; i += 1) {
      await store(`evt_${String(i).padStart(2, '0')}`, (100 - i) * MINUTE);
    }
    const { seen, job } = recordingHandlers();

    const first = await runJob(job, jobCtx(NOW));
    expect(first.counts).toMatchObject({ selected: 50, processed: 50 });
    expect(seen).toHaveLength(50);
    expect(seen[0]).toBe('evt_00');
    expect(seen[49]).toBe('evt_49');

    const second = await runJob(job, jobCtx(NOW));
    expect(second.counts).toMatchObject({ selected: 5, processed: 5 });
    expect(seen.slice(50)).toEqual(['evt_50', 'evt_51', 'evt_52', 'evt_53', 'evt_54']);

    expect((await runJob(job, jobCtx(NOW))).counts).toMatchObject({ selected: 0 });
  });

  it('records a failing handler on the row, alerts once, carries on, and never sweeps it again', async () => {
    await store('evt_bad', 30 * MINUTE);
    await store('evt_good', 20 * MINUTE);
    const { seen, job } = recordingHandlers({ failOn: 'evt_bad' });

    const first = await runJob(job, jobCtx(NOW));

    expect(first.counts).toMatchObject({ selected: 2, processed: 1, failedEvents: 1 });
    expect(seen).toEqual(['evt_good']);
    const bad = await rowOf('evt_bad');
    expect(bad.processedAt).toBeNull();
    expect(bad.error).toContain('handler failed for evt_bad');
    expect(await emails('ADMIN_ALERT')).toHaveLength(1);

    const second = await runJob(job, jobCtx(NOW));
    expect(second.counts).toMatchObject({ selected: 0 });
    expect(await emails('ADMIN_ALERT')).toHaveLength(1);
  });

  it('lets two sweepers at once process an event only once', async () => {
    await store('evt_once', 10 * MINUTE);
    const { seen, job } = recordingHandlers({ delayMs: 300 });

    const results = await Promise.all([runJob(job, jobCtx(NOW)), runJob(job, jobCtx(NOW))]);

    expect(results.map((r) => r.status).sort()).toEqual(['ok', 'skipped']);
    expect(seen).toEqual(['evt_once']);
  });

  it('needs no Razorpay client when there is nothing to sweep', async () => {
    const noPayments = buildTestEnv({
      PAYMENTS_MODE: 'off',
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      RAZORPAY_WEBHOOK_SECRET: '',
    });
    let built = false;
    const job = createWebhookSweeperJob(() => {
      built = true;
      return {};
    });

    expect((await runJob(job, jobCtx(NOW, { env: noPayments }))).status).toBe('ok');
    expect((await runJob(webhookSweeperJob, jobCtx(NOW, { env: noPayments }))).status).toBe('ok');
    expect(built).toBe(false);
  });

  it('moves the deal for a stuck payment.captured exactly as the route does', async () => {
    // One deal paid through the route, one through the sweeper.
    const viaRoute = await dealWithOrder(call, 'commission');
    razorpayCaptured(razorpay, viaRoute, 'commission', { paymentId: 'pay_route' });
    await deliverWebhook(app, paymentCapturedEvent(viaRoute.orderId, 'pay_route', viaRoute.amount));

    const stuck = await dealWithOrder(call, 'commission');
    razorpayCaptured(razorpay, stuck, 'commission', { paymentId: 'pay_stuck' });
    await store(
      'evt_captured',
      15 * MINUTE,
      {},
      'payment.captured',
      paymentCapturedEvent(stuck.orderId, 'pay_stuck', stuck.amount),
    );
    expect((await dealState(stuck.deal.id)).deal.status).toBe('CONFIRMED');

    const result = await runJob(webhookSweeperJob, jobCtx(NOW));

    expect(result.counts).toMatchObject({ selected: 1, processed: 1, failedEvents: 0 });
    const swept = await dealState(stuck.deal.id);
    const routed = await dealState(viaRoute.deal.id);
    expect(swept.deal.status).toBe('COMMISSION_PAID');
    expect(swept.deal.status).toBe(routed.deal.status);
    expect(swept.deal.commissionPaidAt).not.toBeNull();
    expect(swept.events.map((e) => [e.fromStatus, e.toStatus, e.actorType])).toEqual(
      routed.events.map((e) => [e.fromStatus, e.toStatus, e.actorType]),
    );
    const invoicesOf = async (dealId: string) =>
      (await db.select().from(invoices).where(eq(invoices.dealId, dealId))).length;
    expect(await invoicesOf(stuck.deal.id)).toBe(1);
    expect(await invoicesOf(stuck.deal.id)).toBe(await invoicesOf(viaRoute.deal.id));
    const emailsOf = async (userId: string) =>
      (await db.select().from(emailLog).where(eq(emailLog.userId, userId)))
        .map((e) => e.template)
        .sort();
    expect(await emailsOf(stuck.brand.user.id)).toEqual(await emailsOf(viaRoute.brand.user.id));
    expect((await rowOf('evt_captured')).processedAt).not.toBeNull();

    // Sweeping again does nothing.
    const again = await runJob(webhookSweeperJob, jobCtx(NOW));
    expect(again.counts).toMatchObject({ selected: 0 });
    expect(await invoicesOf(stuck.deal.id)).toBe(1);
  });
});
