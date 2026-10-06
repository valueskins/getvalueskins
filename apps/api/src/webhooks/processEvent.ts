import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { webhookEvents } from '../db/schema/index.js';
import { send } from '../email/send.js';
import type { Env } from '../env/index.js';
import type { WebhookHandlerRegistry } from './types.js';

const MAX_ERROR_LENGTH = 500;

/**
 * Runs the handler for a stored event (SPEC 7.3). Marks it processed on
 * success. On failure it records the error message on the event row (never the
 * payload) and emails admin alert A1; it is not retried.
 */
export async function processWebhookEvent(
  env: Env,
  handlers: WebhookHandlerRegistry,
  eventId: string,
): Promise<void> {
  const [event] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.id, eventId))
    .limit(1);
  if (!event || event.processedAt) return;

  const handler = handlers[event.eventType];

  try {
    if (handler) await handler(event.payload);
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date(), error: null })
      .where(eq(webhookEvents.id, eventId));
  } catch (error) {
    const message = (error instanceof Error ? error.message : 'Unknown error').slice(
      0,
      MAX_ERROR_LENGTH,
    );
    await db.update(webhookEvents).set({ error: message }).where(eq(webhookEvents.id, eventId));

    await send(
      'ADMIN_ALERT',
      env.DISPUTE_EMAIL,
      {
        subjectLine: 'Razorpay webhook processing failed',
        details: `Event ${eventId} (${event.eventType}) failed: ${message}`,
      },
      env,
    );
  }
}
