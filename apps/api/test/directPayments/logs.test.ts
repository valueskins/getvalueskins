import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http as api,
  insertDeal,
} from '../helpers/deals.js';
import { confirmPayment, notReceived, recordPayment } from '../payments/fixture.js';
import { newOrdersState, ordersHandlers } from '../payments/razorpayOrdersMock.js';
import { buildTestEnv } from '../testEnv.js';

// Capture every log line, to prove the creator's UPI ID never reaches them.
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
const call = api(createApp(env, { now: () => NOW }));
const server = setupServer();

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
  captured.lines.length = 0;
  server.use(...ordersHandlers(newOrdersState()));
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await closeDb();
});

describe('no log line carries the creator UPI ID', () => {
  it('through reading what to pay, recording, a payment not received, and a confirmation', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'COMMISSION_PAID', { creatorId: creator.user.id });
    const [row] = await db.select().from(users).where(eq(users.id, creator.user.id));
    const vpa = row!.payoutVpa as string;
    const local = vpa.split('@')[0] as string;

    await call.get(`/api/deals/${deal.id}/direct-payment`, brand.cookie);
    const first = await recordPayment(call, brand, deal.id, 'ADVANCE', 'FIRSTUTR001');
    await notReceived(call, creator, first.body.directPayment.id);
    const second = await recordPayment(call, brand, deal.id, 'ADVANCE', 'SECONDUTR01');
    await confirmPayment(call, creator, second.body.directPayment.id);
    // And a refused call, whose error is logged.
    await recordPayment(call, brand, deal.id, 'ADVANCE', 'short');

    const logs = captured.lines.join('\n');
    expect(logs).toContain('request completed');
    expect(logs.length).toBeGreaterThan(500);
    for (const secret of [vpa, local, row!.payoutName as string]) {
      expect(logs, `a log line contains ${secret}`).not.toContain(secret);
    }
  });
});
