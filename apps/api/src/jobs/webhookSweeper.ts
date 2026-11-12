import { and, asc, eq, isNull, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { webhookEvents } from '../db/schema/index.js';
import { createRazorpayClient } from '../razorpay/client.js';
import { createWebhookHandlers } from '../webhooks/handlers/index.js';
import { processWebhookEvent } from '../webhooks/processEvent.js';
import type { WebhookHandlerRegistry } from '../webhooks/types.js';
import { logger } from '../logging/logger.js';
import type { JobContext, JobCounts, JobDefinition } from './types.js';

/** An event younger than this is probably still being processed by the request that stored it. */
const MIN_AGE_MS = 2 * 60 * 1000;
/** At most this many events a run, oldest first; the next run takes the rest. */
const BATCH_SIZE = 50;

/** The handlers the Razorpay webhook route uses, built with this run's clock. */
function routeHandlers(ctx: JobContext): WebhookHandlerRegistry {
  return createWebhookHandlers(ctx.env, {
    env: ctx.env,
    razorpay: createRazorpayClient(ctx.env, { sleep: ctx.sleep }),
    now: ctx.now,
  });
}

/**
 * Every 10 minutes: processes the webhook events that were stored but never processed (SPEC 7.3,
 * 14). The webhook route answers 200 and then processes the event in the background, so a restart in
 * between leaves `processed_at` empty, and Razorpay does not send the same event id again. This
 * picks up the rows with no `processed_at` and no `error` that are more than 2 minutes old, oldest
 * first, at most 50 a run, and gives each to `processWebhookEvent` with the route's handlers. A row
 * with an error stays for the administrator, as before. Capture is idempotent, so a double run with
 * the route's own processing is harmless; the job's advisory lock stops two sweepers overlapping.
 * Count names avoid the words the logger redacts.
 */
export function createWebhookSweeperJob(
  makeHandlers: (ctx: JobContext) => WebhookHandlerRegistry = routeHandlers,
): JobDefinition {
  return {
    name: 'webhook-sweeper',
    schedule: '*/10 * * * *',
    description:
      'Process webhook events that were stored but never processed, because the API stopped after answering 200',
    async run(ctx): Promise<JobCounts> {
      const cutoff = new Date(ctx.now().getTime() - MIN_AGE_MS);
      const stuck = await db
        .select({ id: webhookEvents.id })
        .from(webhookEvents)
        .where(
          and(
            isNull(webhookEvents.processedAt),
            isNull(webhookEvents.error),
            lt(webhookEvents.receivedAt, cutoff),
          ),
        )
        .orderBy(asc(webhookEvents.receivedAt), asc(webhookEvents.id))
        .limit(BATCH_SIZE);

      if (stuck.length === 0) return { selected: 0, processed: 0, failedEvents: 0 };
      let processed = 0;
      let failedEvents = 0;

      // Built only when there is something to process, so an idle sweep needs no Razorpay keys.
      const handlers = makeHandlers(ctx);
      for (const { id } of stuck) {
        try {
          await processWebhookEvent(ctx.env, handlers, id);
          const [row] = await db
            .select({ processedAt: webhookEvents.processedAt })
            .from(webhookEvents)
            .where(eq(webhookEvents.id, id))
            .limit(1);
          if (row?.processedAt) processed += 1;
          else failedEvents += 1;
        } catch (error) {
          // One event that cannot be recorded must not stop the others. It is tried again next run.
          failedEvents += 1;
          logger.error({ eventId: id, err: error }, 'webhook sweeper could not finish an event');
        }
      }
      return { selected: stuck.length, processed, failedEvents };
    },
  };
}

export const webhookSweeperJob = createWebhookSweeperJob();
