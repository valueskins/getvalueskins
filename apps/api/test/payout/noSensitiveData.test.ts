import { createHmac } from 'node:crypto';
import { setupServer } from 'msw/node';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/db/client.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { instagramUser } from '../helpers/auth.js';
import { buildTestEnv } from '../testEnv.js';
import { ECHOED_ACCOUNT_NUMBER, newRazorpayState, razorpayHandlers } from './razorpayMock.js';

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
const app = createApp(env, { razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} } });
const server = setupServer();
const razorpay = newRazorpayState();

const PAN = 'ABCPE1234F';
const ACCOUNT_NUMBER = '123456789012';
const PHONE = '9876543210';
const PHONE_AS_TYPED = '+91 98765 43210';

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
  captured.lines.length = 0;
});
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

describe('no PAN, full account number or phone anywhere (CLAUDE.md rule 5)', () => {
  it('after a full payout flow, a refresh, a webhook and a rejected attempt', async () => {
    server.use(...razorpayHandlers(razorpay));
    const { cookie } = await instagramUser({
      role: 'CREATOR',
      roleLockedAt: new Date(),
      email: 'creator@example.com',
      emailVerifiedAt: new Date(),
    });
    const form = {
      legalName: 'Jane Doe',
      pan: PAN,
      bankAccountNumber: ACCOUNT_NUMBER,
      ifsc: 'HDFC0001234',
      accountHolderName: 'Jane Doe',
      phone: PHONE_AS_TYPED,
      consent: true,
    };
    const submit = (body: object) =>
      request(app)
        .post('/api/me/payout-account')
        .set('Origin', env.WEB_ORIGIN)
        .set('Cookie', cookie)
        .send(body);

    // A rejected attempt whose Razorpay error text echoes the personal data.
    razorpay.failures.stakeholder = {
      status: 400,
      times: 1,
      description: `PAN ${PAN} and account ${ACCOUNT_NUMBER} for ${PHONE} were not accepted`,
    };
    expect((await submit(form)).status).toBe(422);
    expect((await submit(form)).status).toBe(200);

    // An invalid form (the validation error must not echo the values).
    expect((await submit({ ...form, pan: 'BADPAN' })).status).toBe(400);

    await request(app).get('/api/me/payout-account').set('Cookie', cookie);
    razorpay.activationStatus = 'needs_clarification';
    await request(app)
      .post('/api/me/payout-account/refresh')
      .set('Origin', env.WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({});

    // A webhook whose payload carries the personal data.
    const body = JSON.stringify({
      event: 'product.route.activated',
      account_id: 'acc_test1',
      created_at: Math.floor(Date.now() / 1000) + 5,
      payload: {
        merchant_product: {
          entity: {
            id: 'acc_prd_test1',
            merchant_id: 'acc_test1',
            activation_status: 'activated',
            pan: PAN,
            legal_info: { pan: PAN },
            active_configuration: { settlements: { account_number: ACCOUNT_NUMBER } },
          },
        },
      },
    });
    await request(app)
      .post('/api/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Event-Id', 'evt_pii')
      .set(
        'X-Razorpay-Signature',
        createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex'),
      )
      .send(body);
    await vi.waitFor(async () => {
      const { rows } = await pool.query('select processed_at from webhook_events where id = $1', [
        'evt_pii',
      ]);
      expect(rows[0]?.processed_at).not.toBeNull();
    });

    const database = await dumpDatabase();
    const logs = captured.lines.join('');
    const forbidden = [
      PAN,
      ACCOUNT_NUMBER,
      PHONE,
      PHONE_AS_TYPED,
      ECHOED_ACCOUNT_NUMBER,
      'ZZZPZ9999Z',
    ];

    // Sanity: the scan is looking at real data, and the allowed fields are there.
    expect(database).toContain('"bank_last4": "9012"');
    expect(database).toContain('HDFC0001234');
    expect(database).toContain('evt_pii');
    expect(logs).toContain('request completed');

    for (const value of forbidden) {
      expect(database, `database contains ${value}`).not.toContain(value);
      expect(logs, `logs contain ${value}`).not.toContain(value);
    }
  });
});
