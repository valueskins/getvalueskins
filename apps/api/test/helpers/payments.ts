import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Express } from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { db } from '../../src/db/client.js';
import { payments, webhookEvents } from '../../src/db/schema/index.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();

/** What Checkout hands back: HMAC-SHA256 of `order_id|payment_id` with the key secret. */
export function checkoutSignature(
  orderId: string,
  paymentId: string,
  secret = env.RAZORPAY_KEY_SECRET,
) {
  return createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

export function verifyBody(orderId: string, paymentId: string, signature?: string) {
  return {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature ?? checkoutSignature(orderId, paymentId),
  };
}

let eventCounter = 0;

/** POST a Razorpay webhook exactly as Razorpay would: raw body, HMAC over the same bytes. */
export function deliverWebhook(
  app: Express,
  payload: object,
  options: { eventId?: string; signature?: string } = {},
) {
  const body = JSON.stringify(payload);
  eventCounter += 1;
  const eventId = options.eventId ?? `evt_pay_${eventCounter}`;
  const signature =
    options.signature ??
    createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
  return request(app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Event-Id', eventId)
    .set('X-Razorpay-Signature', signature)
    .send(body)
    .then(async (response) => {
      // Processing continues after the 200: wait until the event row is finished.
      if (response.status === 200) {
        await vi.waitFor(async () => {
          const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
          if (!row || (!row.processedAt && !row.error)) throw new Error('webhook still processing');
        });
      }
      return { response, eventId };
    });
}

export function paymentCapturedEvent(orderId: string, paymentId: string, amount: number) {
  return {
    entity: 'event',
    event: 'payment.captured',
    contains: ['payment'],
    created_at: 1_790_000_000,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount,
          currency: 'INR',
          status: 'captured',
          email: 'payer@example.com',
          contact: '+919876543210',
          vpa: 'payer@okbank',
          card: { last4: '1111', network: 'Visa', name: 'Payer Name' },
        },
      },
    },
  };
}

export function orderPaidEvent(orderId: string, paymentId: string, amount: number) {
  return {
    entity: 'event',
    event: 'order.paid',
    contains: ['payment', 'order'],
    created_at: 1_790_000_000,
    payload: {
      payment: { entity: { id: paymentId, order_id: orderId, amount, status: 'captured' } },
      order: { entity: { id: orderId, amount, status: 'paid' } },
    },
  };
}

export function paymentFailedEvent(
  orderId: string,
  paymentId: string,
  description = 'Card declined',
) {
  return {
    entity: 'event',
    event: 'payment.failed',
    contains: ['payment'],
    created_at: 1_790_000_000,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          status: 'failed',
          error_code: 'BAD_REQUEST_ERROR',
          error_description: description,
          email: 'payer@example.com',
          contact: '+919876543210',
        },
      },
    },
  };
}

export function transferEvent(
  event: 'transfer.processed' | 'transfer.failed' | 'transfer.reversed',
  transfer: Record<string, unknown>,
) {
  return {
    entity: 'event',
    event,
    contains: ['transfer'],
    created_at: 1_790_000_000,
    payload: { transfer: { entity: { entity: 'transfer', ...transfer } } },
  };
}

export async function paymentRow(orderId: string) {
  const [row] = await db.select().from(payments).where(eq(payments.razorpayOrderId, orderId));
  return row;
}
