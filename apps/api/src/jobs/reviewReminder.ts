import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deals } from '../db/schema/index.js';
import { DAY_MS, sendOncePerDay, tally } from './dailyOnce.js';
import type { JobCounts, JobDefinition } from './types.js';

/**
 * Email 14 to the brand, daily at 10:00 IST: content has waited more than 3 days for review.
 * `content_uploaded_at` is set on every upload, so after a revision it counts from the new one.
 */
export const reviewReminderJob: JobDefinition = {
  name: 'review-reminder',
  schedule: '0 10 * * *',
  description: 'Email 14: the brand has not reviewed uploaded content for 3 days',
  async run(ctx): Promise<JobCounts> {
    const now = ctx.now();
    const cutoff = new Date(now.getTime() - 3 * DAY_MS);
    const rows = await db
      .select({
        id: deals.id,
        shortId: deals.shortId,
        title: deals.title,
        brandId: deals.brandId,
        contentUploadedAt: deals.contentUploadedAt,
      })
      .from(deals)
      .where(and(eq(deals.status, 'CONTENT_UPLOADED'), lt(deals.contentUploadedAt, cutoff)));

    const counts: JobCounts = { selected: rows.length };
    for (const deal of rows) {
      if (deal.contentUploadedAt === null) continue;
      const outcome = await sendOncePerDay(ctx, {
        template: 'REVIEW_REMINDER',
        dealId: deal.id,
        userId: deal.brandId,
        data: {
          dealShortId: deal.shortId,
          dealTitle: deal.title ?? '',
          daysInReview: Math.floor((now.getTime() - deal.contentUploadedAt.getTime()) / DAY_MS),
        },
      });
      tally(counts, outcome);
    }
    return counts;
  },
};
