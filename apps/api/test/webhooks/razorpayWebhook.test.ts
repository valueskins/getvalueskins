import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { emailLog, webhookEvents } from '../../src/db/schema/index.js';
import { errorMiddleware } from '../../src/errors/errorMiddleware.js';
import { RAZORPAY_WEBHOOK_PATH, webhookRawBodyMiddleware } from '../../src/security/index.js';
import { razorpayWebhookRoutes } from '../../src/webhooks/razorpay.routes.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();
const app = createApp(env);

beforeAll(async () => {
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await closeDb();
});

const sign = (body: string, secret = env.RAZORPAY_WEBHOOK_SECRET) =>
  createHmac('sha256', secret).update(body).digest('hex');

interface DeliveryOptions {
  eventId?: string | null;
  signature?: string | null;
  secret?: string;
  app?: express.Express;
}

/** POST the raw string exactly as Razorpay would, with the signature over those bytes. */
function deliver(body: string, options: DeliveryOptions = {}) {
  const eventId = options.eventId === undefined ? 'evt_1' : options.eventId;
  const signature =
    options.signature === undefined ? sign(body, options.secret) : options.signature;

  let req = request(options.app ?? app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json');
  if (eventId !== null) req = req.set('X-Razorpay-Event-Id', eventId);
  if (signature !== null) req = req.set('X-Razorpay-Signature', signature);
  return req.send(body);
}

function productEvent(
  eventName: string,
  status: string,
  extra: { createdAt?: number; accountId?: string; requirements?: unknown[]; entity?: object } = {},
) {
  return JSON.stringify({
    entity: 'event',
    account_id: extra.accountId ?? 'acc_test1',
    event: eventName,
    contains: ['merchant_product'],
    payload: {
      merchant_product: {
        entity: {
          id: 'acc_prd_test1',
          merchant_id: extra.accountId ?? 'acc_test1',
          activation_status: status,
          ...(extra.requirements ? { requirements: extra.requirements } : {}),
          ...extra.entity,
        },
      },
    },
    created_at: extra.createdAt ?? Math.floor(Date.now() / 1000),
  });
}

const eventRows = () => db.select().from(webhookEvents);
const emailsOf = (template: string) =>
  db.select().from(emailLog).where(eq(emailLog.template, template));

async function waitForProcessed(eventId = 'evt_1') {
  await vi.waitFor(async () => {
    const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
    expect(row?.processedAt ?? row?.error).toBeTruthy();
  });
}

function miniApp(handlers: Record<string, (payload: unknown) => Promise<void>>) {
  const mini = express();
  mini.use(RAZORPAY_WEBHOOK_PATH, webhookRawBodyMiddleware);
  mini.use(razorpayWebhookRoutes(env, handlers));
  mini.use(errorMiddleware);
  return mini;
}

describe('signature verification (raw body)', () => {
  const body = productEvent('product.route.activated', 'activated');

  it('accepts a correctly signed delivery with 200 and stores the event', async () => {
    const response = await deliver(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    const [row] = await eventRows();
    expect(row?.id).toBe('evt_1');
    expect(row?.eventType).toBe('product.route.activated');
  });

  it('rejects a wrong signature with 400 and stores nothing', async () => {
    const response = await deliver(body, { signature: 'a'.repeat(64) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_WEBHOOK');
    expect(await eventRows()).toHaveLength(0);
  });

  it('rejects a body changed after signing', async () => {
    const response = await deliver(body.replace('activated', 'suspended'), {
      signature: sign(body),
    });

    expect(response.status).toBe(400);
    expect(await eventRows()).toHaveLength(0);
  });

  it('rejects a signature made with a different secret', async () => {
    const response = await deliver(body, { secret: 'not-the-webhook-secret' });
    expect(response.status).toBe(400);
    expect(await eventRows()).toHaveLength(0);
  });

  it('rejects a missing signature, a missing event id, and a signature of the wrong length', async () => {
    expect((await deliver(body, { signature: null })).status).toBe(400);
    expect((await deliver(body, { eventId: null })).status).toBe(400);
    expect((await deliver(body, { signature: 'abc' })).status).toBe(400);
    expect(await eventRows()).toHaveLength(0);
  });

  it('rejects a body that is not JSON, or has no event type, even when correctly signed', async () => {
    expect((await deliver('not json')).status).toBe(400);
    expect((await deliver(JSON.stringify({ hello: 'world' }))).status).toBe(400);
    expect(await eventRows()).toHaveLength(0);
  });

  it('does not need an Origin header or a session: the signature is the authentication', async () => {
    const response = await deliver(body);
    expect(response.status).toBe(200);
  });
});

describe('Route product events (Route is not available, REPLACEMENT_PLAN 0)', () => {
  it.each([
    'product.route.under_review',
    'product.route.needs_clarification',
    'product.route.activated',
  ])('stores %s and marks it processed, with no handler, no error and no email', async (name) => {
    const response = await deliver(productEvent(name, 'activated'));
    await waitForProcessed();

    expect(response.status).toBe(200);
    const [row] = await eventRows();
    expect(row).toMatchObject({ eventType: name, error: null });
    expect(row?.processedAt).not.toBeNull();
    expect(await db.select().from(emailLog)).toHaveLength(0);
  });
});

describe('deduplication on x-razorpay-event-id', () => {
  it('ignores a repeated delivery: one row, handled once, still 200', async () => {
    const handled: unknown[] = [];
    const mini = miniApp({
      'test.once': async (payload) => {
        handled.push(payload);
      },
    });
    const body = JSON.stringify({ event: 'test.once', created_at: 1 });

    const first = await deliver(body, { app: mini });
    await waitForProcessed();
    const second = await deliver(body, { app: mini });
    const third = await deliver(body, { app: mini });
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect([first.status, second.status, third.status]).toEqual([200, 200, 200]);
    expect(await eventRows()).toHaveLength(1);
    expect(handled).toHaveLength(1);
  });

  it('treats two different event ids as two events', async () => {
    const handled: unknown[] = [];
    const mini = miniApp({
      'test.twice': async (payload) => {
        handled.push(payload);
      },
    });
    const body = JSON.stringify({ event: 'test.twice', created_at: 1 });

    await deliver(body, { eventId: 'evt_a', app: mini });
    await deliver(body, { eventId: 'evt_b', app: mini });
    await vi.waitFor(() => expect(handled).toHaveLength(2));

    expect(await eventRows()).toHaveLength(2);
  });
});

describe('what is stored', () => {
  it('redacts account numbers, PAN and legal info before storing the payload', async () => {
    const body = productEvent('product.route.activated', 'activated', {
      entity: {
        active_configuration: {
          settlements: { account_number: '123456789012', ifsc_code: 'HDFC0001234' },
        },
        legal_info: { pan: 'ABCPE1234F' },
        pan: 'ABCPE1234F',
      },
    });

    await deliver(body);

    const [row] = await eventRows();
    const stored = JSON.stringify(row?.payload);
    expect(stored).not.toContain('123456789012');
    expect(stored).not.toContain('ABCPE1234F');
    expect(stored).toContain('****9012');
    expect(stored).toContain('acc_prd_test1');
  });
});

describe('the handler registry and the fast 200', () => {
  it('answers 200 before the handler finishes', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let finished = false;
    const handler = async () => {
      await gate;
      finished = true;
    };

    const body = JSON.stringify({ event: 'test.slow', created_at: 1 });
    const response = await deliver(body, { app: miniApp({ 'test.slow': handler }) });

    expect(response.status).toBe(200);
    expect(finished).toBe(false);

    release();
    await waitForProcessed();
    expect(finished).toBe(true);
  });

  it('runs the handler registered for the event type, with the stored payload', async () => {
    const seen: unknown[] = [];
    const body = JSON.stringify({ event: 'test.known', created_at: 1, value: 42 });

    await deliver(body, {
      app: miniApp({
        'test.known': async (payload) => {
          seen.push(payload);
        },
      }),
    });
    await waitForProcessed();

    expect(seen).toEqual([{ event: 'test.known', created_at: 1, value: 42 }]);
  });

  it('stores an event with no handler and marks it processed', async () => {
    const body = JSON.stringify({ event: 'settlement.processed', created_at: 1 });

    const response = await deliver(body);
    await waitForProcessed();

    expect(response.status).toBe(200);
    const [row] = await eventRows();
    expect(row?.eventType).toBe('settlement.processed');
    expect(row?.processedAt).not.toBeNull();
    expect(row?.error).toBeNull();
    expect(await emailsOf('ADMIN_ALERT')).toHaveLength(0);
  });

  it('a handler that throws is recorded, alerted, and not retried', async () => {
    let calls = 0;
    const body = JSON.stringify({ event: 'test.boom', created_at: 1 });

    await deliver(body, {
      app: miniApp({
        'test.boom': async () => {
          calls += 1;
          throw new Error('handler exploded');
        },
      }),
    });
    await waitForProcessed();
    await deliver(body, {
      app: miniApp({
        'test.boom': async () => {
          calls += 1;
        },
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(calls).toBe(1);
    const [row] = await eventRows();
    expect(row?.error).toBe('handler exploded');
    expect(await emailsOf('ADMIN_ALERT')).toHaveLength(1);
  });
});
