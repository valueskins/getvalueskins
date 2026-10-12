import type { EmailTemplate } from '@valueskins/shared';
import { and, eq, gte, lt, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emailLog } from '../db/schema/index.js';
import { emailOf } from '../email/recipients.js';
import { send } from '../email/send.js';
import type { EmailTemplateDataMap } from '../email/types.js';
import { istDayBounds } from './istDay.js';
import type { JobContext, JobCounts } from './types.js';

export type DailyOutcome = 'sent' | 'already_sent' | 'no_email' | 'failed';

/**
 * Sends a reminder unless this user already got the same template for this deal today (IST), as
 * recorded in `email_log` (SPEC 8: at most one reminder per deal per day). A FAILED send does not
 * count, so it is tried again on the next run; a QUEUED one does, because the send may have
 * happened. Two runs racing this check are kept apart by the job's advisory lock.
 */
export async function sendOncePerDay<T extends EmailTemplate>(
  ctx: JobContext,
  args: { template: T; dealId: string; userId: string; data: EmailTemplateDataMap[T] },
): Promise<DailyOutcome> {
  const to = await emailOf(args.userId);
  if (!to) return 'no_email';

  const now = ctx.now();
  const { start, end } = istDayBounds(now);
  const [existing] = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(
      and(
        eq(emailLog.template, args.template),
        eq(emailLog.dealId, args.dealId),
        eq(emailLog.userId, args.userId),
        gte(emailLog.createdAt, start),
        lt(emailLog.createdAt, end),
        ne(emailLog.status, 'FAILED'),
      ),
    )
    .limit(1);
  if (existing) return 'already_sent';

  const result = await send(args.template, to, args.data, ctx.env, {
    dealId: args.dealId,
    userId: args.userId,
    now,
  });
  return result.status === 'FAILED' ? 'failed' : 'sent';
}

/** Adds one outcome to a job's counts (`sent`, `alreadySent`, `noEmail`, `failed`). */
export function tally(counts: JobCounts, outcome: DailyOutcome): void {
  const key =
    outcome === 'already_sent' ? 'alreadySent' : outcome === 'no_email' ? 'noEmail' : outcome;
  counts[key] = (counts[key] ?? 0) + 1;
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
