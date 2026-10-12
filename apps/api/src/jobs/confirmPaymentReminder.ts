import { and, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deals, directPayments } from '../db/schema/index.js';
import { HOUR_MS, sendOncePerDay, tally } from './dailyOnce.js';
import type { JobCounts, JobDefinition } from './types.js';

/**
 * Email 20 to the confirmed creator, every 6 hours: a direct payment the brand recorded has
 * waited more than 12 hours for the creator to confirm it or say it did not arrive. The deal must
 * still be in the status that stage belongs to (an admin-cancelled deal gets nothing). The email
 * never carries the UPI ID. It is still sent at most once per deal per day.
 */
export const confirmPaymentReminderJob: JobDefinition = {
  name: 'confirm-payment-reminder',
  schedule: '0 */6 * * *',
  description: 'Email 20: the creator has not confirmed a recorded payment 12 hours later',
  async run(ctx): Promise<JobCounts> {
    const cutoff = new Date(ctx.now().getTime() - 12 * HOUR_MS);
    const rows = await db
      .select({
        dealId: deals.id,
        shortId: deals.shortId,
        title: deals.title,
        creatorId: deals.creatorId,
        stage: directPayments.stage,
        amountPaise: directPayments.amountPaise,
      })
      .from(directPayments)
      .innerJoin(deals, eq(directPayments.dealId, deals.id))
      .where(
        and(
          isNull(directPayments.confirmedAt),
          isNull(directPayments.disputedAt),
          lt(directPayments.recordedAt, cutoff),
          isNotNull(deals.creatorId),
          or(
            and(eq(directPayments.stage, 'ADVANCE'), eq(deals.status, 'COMMISSION_PAID')),
            and(eq(directPayments.stage, 'FINAL'), eq(deals.status, 'APPROVED')),
          ),
        ),
      );

    const counts: JobCounts = { selected: rows.length };
    for (const row of rows) {
      if (row.creatorId === null) continue;
      const outcome = await sendOncePerDay(ctx, {
        template: 'DIRECT_PAYMENT_CONFIRM_REMINDER',
        dealId: row.dealId,
        userId: row.creatorId,
        data: {
          dealShortId: row.shortId,
          dealTitle: row.title ?? '',
          stage: row.stage,
          amountPaise: row.amountPaise,
        },
      });
      tally(counts, outcome);
    }
    return counts;
  },
};
