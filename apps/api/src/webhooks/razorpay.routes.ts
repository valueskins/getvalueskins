import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { db } from '../db/client.js';
import { webhookEvents } from '../db/schema/index.js';
import type { Env } from '../env/index.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';
import { captureError } from '../observability/sentry.js';
import { RAZORPAY_WEBHOOK_PATH } from '../security/index.js';
import { createWebhookHandlers } from './handlers/index.js';
import { processWebhookEvent } from './processEvent.js';
import { redactWebhookPayload } from './redact.js';
import type { WebhookHandlerRegistry } from './types.js';

function invalid(message: string): AppError {
  return new AppError('INVALID_WEBHOOK', 400, message);
}

function signatureMatches(rawBody: Buffer, secret: string, signature: string): boolean {
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * SPEC 7.3. The body is the raw bytes (webhookRawBodyMiddleware, mounted in
 * app.ts before the JSON parser), because the signature is over the raw body.
 * Flow: verify the signature (400 if invalid), deduplicate on the event id,
 * answer 200 straight away, then process in the background. Origin checks do
 * not apply (the path is exempt); the signature is the authentication.
 */
export function razorpayWebhookRoutes(
  env: Env,
  handlers: WebhookHandlerRegistry = createWebhookHandlers(env),
): Router {
  const router = Router();

  router.post(RAZORPAY_WEBHOOK_PATH, async (req, res, next) => {
    try {
      const signature = req.header('x-razorpay-signature');
      const eventId = req.header('x-razorpay-event-id');
      const rawBody: unknown = req.body;

      if (!Buffer.isBuffer(rawBody) || !signature || !eventId || eventId.length > 255) {
        throw invalid('Missing webhook body, signature or event id');
      }
      if (!signatureMatches(rawBody, env.RAZORPAY_WEBHOOK_SECRET, signature)) {
        throw invalid('Invalid webhook signature');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody.toString('utf8'));
      } catch {
        throw invalid('Webhook body is not JSON');
      }
      const eventType = (parsed as { event?: unknown } | null)?.event;
      if (typeof eventType !== 'string' || eventType.length === 0 || eventType.length > 128) {
        throw invalid('Webhook body has no event type');
      }

      const inserted = await db
        .insert(webhookEvents)
        .values({
          id: eventId,
          eventType,
          payload: redactWebhookPayload(parsed) as Record<string, unknown>,
        })
        .onConflictDoNothing()
        .returning({ id: webhookEvents.id });

      res.status(200).json({ ok: true });

      // A conflict means Razorpay delivered this event id before: nothing to do.
      if (inserted.length === 0) return;

      setImmediate(() => {
        processWebhookEvent(env, handlers, eventId).catch((error: unknown) => {
          logger.error({ err: error, eventId }, 'webhook processing could not be recorded');
          captureError(error, 'razorpay webhook processing');
        });
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
