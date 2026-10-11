import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/db/client.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, http as api } from '../helpers/deals.js';
import {
  deliverWebhook,
  orderPaidEvent,
  paymentCapturedEvent,
  paymentFailedEvent,
  verifyBody,
} from '../helpers/payments.js';
import { buildTestEnv } from '../testEnv.js';
import { dealWithOrder, razorpayCaptured } from './fixture.js';
import { newOrdersState, ordersHandlers } from './razorpayOrdersMock.js';

// Capture everything the app logs, using the real logger configuration.
const captured = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock('../../src/logging/logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/logging/logger.js')>();
  process.env.LOG_LEVEL = 'debug';
  return {
    ...actual,
    logger: actual.buildLogger({
      write: (chunk: string) => {
        captured.lines.push(chunk);
      },
    }),
  };
});

const env = buildTestEnv();
const app = createApp(env, {
  now: () => NOW,
  razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} },
});
const call = api(app);
const server = setupServer();
const razorpay = newOrdersState();

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
  captured.lines.length = 0;
  server.use(...ordersHandlers(razorpay));
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await closeDb();
});

/** Every row of every table, as text. */
async function dumpDatabase(): Promise<string> {
  const { rows: tables } = await pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  const parts: string[] = [];
  for (const { tablename } of tables) {
    const { rows } = await pool.query<{ row: string }>(
      `select to_jsonb(t)::text as row from "${tablename}" t`,
    );
    parts.push(...rows.map((r) => `${tablename}: ${r.row}`));
  }
  return parts.join('\n');
}

describe('no payer details anywhere (CLAUDE.md rule 5, SPEC 20)', () => {
  it('after orders, a failed attempt, verify and every payment webhook', async () => {
    const f = await dealWithOrder(call, 'commission');
    const paymentId = razorpayCaptured(razorpay, f, 'commission');

    await deliverWebhook(app, paymentFailedEvent(f.orderId, 'pay_bad'));
    await deliverWebhook(app, paymentCapturedEvent(f.orderId, paymentId, f.amount));
    await deliverWebhook(app, orderPaidEvent(f.orderId, paymentId, f.amount));
    await call.send(
      'post',
      '/api/payments/verify',
      f.brand.cookie,
      verifyBody(f.orderId, paymentId),
    );

    const database = await dumpDatabase();
    const logs = captured.lines.join('\n');
    expect(logs.length).toBeGreaterThan(0);

    for (const secret of ['payer@example.com', '+919876543210', 'payer@okbank', 'Payer Name']) {
      expect(database, `database contains ${secret}`).not.toContain(secret);
      expect(logs, `logs contain ${secret}`).not.toContain(secret);
    }
    // The key secret and webhook secret never appear either.
    for (const secret of [env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET]) {
      expect(database).not.toContain(secret);
      expect(logs).not.toContain(secret);
    }
    // The ids we do keep are there.
    expect(database).toContain(paymentId);
    expect(database).toContain(f.orderId);
  });
});
