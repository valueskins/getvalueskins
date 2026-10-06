import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { creatorPayoutAccounts, emailLog, webhookEvents } from '../../src/db/schema/index.js';
import { errorMiddleware } from '../../src/errors/errorMiddleware.js';
import { RAZORPAY_WEBHOOK_PATH, webhookRawBodyMiddleware } from '../../src/security/index.js';
import { razorpayWebhookRoutes } from '../../src/webhooks/razorpay.routes.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { instagramUser } from '../helpers/auth.js';
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

async function creatorWithPayoutAccount(
  overrides: Partial<typeof creatorPayoutAccounts.$inferInsert> = {},
) {
  const { user } = await instagramUser({
    role: 'CREATOR',
    roleLockedAt: new Date(),
    email: 'creator@example.com',
    emailVerifiedAt: new Date(),
  });
  await db.insert(creatorPayoutAccounts).values({
    userId: user.id,
    razorpayAccountId: 'acc_test1',
    razorpayStakeholderId: 'sth_test1',
    razorpayProductId: 'acc_prd_test1',
    status: 'PENDING',
    bankLast4: '9012',
    ifsc: 'HDFC0001234',
    ...overrides,
  });
  return user;
}

const accountStatus = async () => (await db.select().from(creatorPayoutAccounts))[0]?.status;
const eventRows = () => db.select().from(webhookEvents);
const emailsOf = (template: string) =>
  db.select().from(emailLog).where(eq(emailLog.template, template));

async function waitForProcessed(eventId = 'evt_1') {
  await vi.waitFor(async () => {
    const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
    expect(row?.processedAt ?? row?.error).toBeTruthy();
  });
}

describe('signature verification (raw body)', () => {
  const body = productEvent('product.route.activated', 'activated');

  it('accepts a correctly signed delivery with 200 and stores the event', async () => {
    await creatorWithPayoutAccount();

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
    await creatorWithPayoutAccount();
    const response = await deliver(body);
    expect(response.status).toBe(200);
  });
});

describe('product status events', () => {
  it('product.route.activated makes the account ACTIVE and emails #16 once', async () => {
    await creatorWithPayoutAccount();

    await deliver(productEvent('product.route.activated', 'activated'));
    await waitForProcessed();

    expect(await accountStatus()).toBe('ACTIVE');
    const emails = await emailsOf('PAYOUT_ACCOUNT_STATUS');
    expect(emails).toHaveLength(1);
    expect(emails[0]?.toEmail).toBe('creator@example.com');
    const [event] = await eventRows();
    expect(event?.processedAt).not.toBeNull();
    expect(event?.error).toBeNull();
  });

  it('product.route.needs_clarification stores the reasons and emails #16', async () => {
    await creatorWithPayoutAccount();

    await deliver(
      productEvent('product.route.needs_clarification', 'needs_clarification', {
        requirements: [
          {
            field_reference: 'settlements.account_number',
            reason_code: 'needs_clarification',
            status: 'required',
          },
        ],
      }),
    );
    await waitForProcessed();

    const [row] = await db.select().from(creatorPayoutAccounts);
    expect(row?.status).toBe('NEEDS_CLARIFICATION');
    expect(row?.requirements).toEqual({
      items: [
        {
          fieldReference: 'settlements.account_number',
          reasonCode: 'needs_clarification',
          status: 'required',
        },
      ],
    });
    const emails = await emailsOf('PAYOUT_ACCOUNT_STATUS');
    expect(emails).toHaveLength(1);
    expect(emails[0]?.subject).toBe('Your payout account needs attention');
  });

  it('product.route.under_review keeps PENDING and sends no email', async () => {
    await creatorWithPayoutAccount();

    await deliver(productEvent('product.route.under_review', 'under_review'));
    await waitForProcessed();

    expect(await accountStatus()).toBe('PENDING');
    expect(await emailsOf('PAYOUT_ACCOUNT_STATUS')).toHaveLength(0);
  });

  it('does not email again when the status did not change', async () => {
    await creatorWithPayoutAccount({ status: 'ACTIVE' });

    await deliver(productEvent('product.route.activated', 'activated'));
    await waitForProcessed();

    expect(await emailsOf('PAYOUT_ACCOUNT_STATUS')).toHaveLength(0);
  });

  it('ignores an event older than the status already applied (out of order delivery)', async () => {
    const now = Math.floor(Date.now() / 1000);
    await creatorWithPayoutAccount({
      status: 'ACTIVE',
      statusSyncedAt: new Date(now * 1000),
    });

    await deliver(
      productEvent('product.route.needs_clarification', 'needs_clarification', {
        createdAt: now - 60,
      }),
      {
        eventId: 'evt_old',
      },
    );
    await waitForProcessed('evt_old');

    expect(await accountStatus()).toBe('ACTIVE');
    expect(await emailsOf('PAYOUT_ACCOUNT_STATUS')).toHaveLength(0);
    const [event] = await eventRows();
    expect(event?.processedAt).not.toBeNull();
    expect(event?.error).toBeNull();
  });

  it('applies a newer event over an older status', async () => {
    const now = Math.floor(Date.now() / 1000);
    await creatorWithPayoutAccount({
      status: 'NEEDS_CLARIFICATION',
      statusSyncedAt: new Date((now - 120) * 1000),
    });

    await deliver(productEvent('product.route.activated', 'activated', { createdAt: now }));
    await waitForProcessed();

    expect(await accountStatus()).toBe('ACTIVE');
  });

  it('records an error and emails admin alert A1 for an unknown linked account', async () => {
    await creatorWithPayoutAccount();

    await deliver(
      productEvent('product.route.activated', 'activated', { accountId: 'acc_unknown' }),
    );
    await waitForProcessed();

    const [event] = await eventRows();
    expect(event?.processedAt).toBeNull();
    expect(event?.error).toContain('acc_unknown');
    expect(await accountStatus()).toBe('PENDING');

    const alerts = await emailsOf('ADMIN_ALERT');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.toEmail).toBe(env.DISPUTE_EMAIL);
    expect(alerts[0]?.bodyText).toContain('evt_1');
    expect(alerts[0]?.bodyText).toContain('product.route.activated');
  });

  it('records an error and alerts the admin when the payload has the wrong shape', async () => {
    await creatorWithPayoutAccount();
    const broken = JSON.stringify({ event: 'product.route.activated', created_at: 1 });

    await deliver(broken);
    await waitForProcessed();

    const [event] = await eventRows();
    expect(event?.error).toBeTruthy();
    expect(await emailsOf('ADMIN_ALERT')).toHaveLength(1);
  });

  it('keeps the alert free of the payload (no personal data in the email or the error)', async () => {
    await creatorWithPayoutAccount();
    await deliver(
      productEvent('product.route.activated', 'activated', {
        accountId: 'acc_unknown',
        entity: { account_number: '123456789012', pan: 'ABCPE1234F' },
      }),
    );
    await waitForProcessed();

    const [event] = await eventRows();
    const alerts = await emailsOf('ADMIN_ALERT');
    for (const text of [event?.error ?? '', alerts[0]?.bodyText ?? '']) {
      expect(text).not.toContain('123456789012');
      expect(text).not.toContain('ABCPE1234F');
    }
  });
});

describe('deduplication on x-razorpay-event-id', () => {
  it('ignores a repeated delivery: one row, handled once, still 200', async () => {
    await creatorWithPayoutAccount();
    const body = productEvent('product.route.activated', 'activated');

    const first = await deliver(body);
    await waitForProcessed();
    // Put the account back: a reprocessed event would flip it to ACTIVE again.
    await db.update(creatorPayoutAccounts).set({ status: 'PENDING', statusSyncedAt: null });
    const second = await deliver(body);
    const third = await deliver(body);
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect([first.status, second.status, third.status]).toEqual([200, 200, 200]);
    expect(await eventRows()).toHaveLength(1);
    expect(await accountStatus()).toBe('PENDING');
    expect(await emailsOf('PAYOUT_ACCOUNT_STATUS')).toHaveLength(1);
  });

  it('treats two different event ids as two events', async () => {
    await creatorWithPayoutAccount();
    const body = productEvent('product.route.under_review', 'under_review');

    await deliver(body, { eventId: 'evt_a' });
    await deliver(body, { eventId: 'evt_b' });

    expect(await eventRows()).toHaveLength(2);
  });
});

describe('what is stored', () => {
  it('redacts account numbers, PAN and legal info before storing the payload', async () => {
    await creatorWithPayoutAccount();
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
  function miniApp(handlers: Record<string, (payload: unknown) => Promise<void>>) {
    const mini = express();
    mini.use(RAZORPAY_WEBHOOK_PATH, webhookRawBodyMiddleware);
    mini.use(razorpayWebhookRoutes(env, handlers));
    mini.use(errorMiddleware);
    return mini;
  }

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
    const body = JSON.stringify({ event: 'payment.captured', created_at: 1 });

    const response = await deliver(body);
    await waitForProcessed();

    expect(response.status).toBe(200);
    const [row] = await eventRows();
    expect(row?.eventType).toBe('payment.captured');
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
