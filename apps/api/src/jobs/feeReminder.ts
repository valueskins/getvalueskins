import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deals } from '../db/schema/index.js';
import { DAY_MS, sendOncePerDay, tally } from './dailyOnce.js';
import type { JobCounts, JobDefinition } from './types.js';

/**
 * Email 12 to the brand, daily at 10:00 IST: the deal has been CONFIRMED for more than 24 hours
 * and the fee is still unpaid (SPEC 14).
 */
export const feeReminderJob: JobDefinition = {
  name: 'fee-reminder',
  schedule: '0 10 * * *',
  description: 'Email 12: the brand has not paid the fee 24 hours after confirming a creator',
  async run(ctx): Promise<JobCounts> {
    const cutoff = new Date(ctx.now().getTime() - DAY_MS);
    const rows = await db
      .select({
        id: deals.id,
        shortId: deals.shortId,
        title: deals.title,
        brandId: deals.brandId,
        commissionTotalPaise: deals.commissionTotalPaise,
      })
      .from(deals)
      .where(and(eq(deals.status, 'CONFIRMED'), lt(deals.confirmedAt, cutoff)));

    const counts: JobCounts = { selected: rows.length };
    for (const deal of rows) {
      if (deal.commissionTotalPaise === null) continue;
      const outcome = await sendOncePerDay(ctx, {
        template: 'COMMISSION_PAYMENT_REMINDER',
        dealId: deal.id,
        userId: deal.brandId,
        data: {
          dealShortId: deal.shortId,
          dealTitle: deal.title ?? '',
          commissionTotalPaise: deal.commissionTotalPaise,
        },
      });
      tally(counts, outcome);
    }
    return counts;
  },
};
