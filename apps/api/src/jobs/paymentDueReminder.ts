import { and, eq, isNull, lt, notExists, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deals, directPayments } from '../db/schema/index.js';
import { DAY_MS, sendOncePerDay, tally } from './dailyOnce.js';
import type { JobCounts, JobDefinition } from './types.js';

/** A direct payment for the stage that has not been marked "not received". A pending or confirmed one counts. */
function liveRecord(stage: 'ADVANCE' | 'FINAL') {
  return db
    .select({ one: sql`1` })
    .from(directPayments)
    .where(
      and(
        eq(directPayments.dealId, deals.id),
        eq(directPayments.stage, stage),
        isNull(directPayments.disputedAt),
      ),
    );
}

/**
 * Email 19 to the brand, daily at 10:00 IST: the advance (COMMISSION_PAID) or the final (APPROVED)
 * has been due for more than 24 hours and no payment is recorded for it. A record the creator
 * marked "not received" does not count, so the brand is reminded to pay again. A record waiting
 * for the creator is the creator's reminder, not this one.
 */
export const paymentDueReminderJob: JobDefinition = {
  name: 'payment-due-reminder',
  schedule: '0 10 * * *',
  description:
    'Email 19: the brand has not recorded the advance or final payment 24 hours after it fell due',
  async run(ctx): Promise<JobCounts> {
    const cutoff = new Date(ctx.now().getTime() - DAY_MS);
    const rows = await db
      .select({
        id: deals.id,
        shortId: deals.shortId,
        title: deals.title,
        brandId: deals.brandId,
        status: deals.status,
        advancePaise: deals.advancePaise,
        finalPaise: deals.finalPaise,
      })
      .from(deals)
      .where(
        or(
          and(
            eq(deals.status, 'COMMISSION_PAID'),
            lt(deals.commissionPaidAt, cutoff),
            notExists(liveRecord('ADVANCE')),
          ),
          and(
            eq(deals.status, 'APPROVED'),
            lt(deals.approvedAt, cutoff),
            notExists(liveRecord('FINAL')),
          ),
        ),
      );

    const counts: JobCounts = { selected: rows.length };
    for (const deal of rows) {
      const stage = deal.status === 'COMMISSION_PAID' ? 'ADVANCE' : 'FINAL';
      const amountPaise = stage === 'ADVANCE' ? deal.advancePaise : deal.finalPaise;
      if (amountPaise === null) continue;
      const outcome = await sendOncePerDay(ctx, {
        template: 'DIRECT_PAYMENT_DUE_REMINDER',
        dealId: deal.id,
        userId: deal.brandId,
        data: { dealShortId: deal.shortId, dealTitle: deal.title ?? '', stage, amountPaise },
      });
      tally(counts, outcome);
    }
    return counts;
  },
};
