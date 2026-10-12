import { contentOverdue, todayIST } from '@valueskins/shared';
import { and, inArray, isNotNull, lte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deals } from '../db/schema/index.js';
import { sendOncePerDay, tally } from './dailyOnce.js';
import type { JobCounts, JobDefinition } from './types.js';

/** The job runs at 23:59, a minute before the deadline day ends, so it looks a few minutes ahead. */
const LOOK_AHEAD_MS = 5 * 60 * 1000;

/**
 * Email 13 to the brand and the creator, daily at 23:59 IST, for every deal whose content is
 * overdue (SPEC 5.4). A deadline that falls today counts as overdue, because the day is about to
 * end; a run by hand at another hour does not count it. The deal keeps its status.
 */
export const contentOverdueJob: JobDefinition = {
  name: 'content-overdue',
  schedule: '59 23 * * *',
  description: 'Email 13: content is past its upload deadline (brand and creator)',
  async run(ctx): Promise<JobCounts> {
    const asOf = new Date(ctx.now().getTime() + LOOK_AHEAD_MS);
    const candidates = await db
      .select({
        id: deals.id,
        shortId: deals.shortId,
        title: deals.title,
        status: deals.status,
        brandId: deals.brandId,
        creatorId: deals.creatorId,
        contentUploadDeadline: deals.contentUploadDeadline,
      })
      .from(deals)
      .where(
        and(
          inArray(deals.status, ['ADVANCE_PAID', 'REVISION_REQUESTED']),
          isNotNull(deals.contentUploadDeadline),
          lte(deals.contentUploadDeadline, todayIST(asOf)),
        ),
      );

    const overdue = candidates.filter(
      (deal) =>
        deal.contentUploadDeadline !== null &&
        contentOverdue(
          { status: deal.status, contentUploadDeadline: deal.contentUploadDeadline },
          asOf,
        ),
    );

    const counts: JobCounts = { selected: overdue.length };
    for (const deal of overdue) {
      const recipients = [deal.brandId, ...(deal.creatorId ? [deal.creatorId] : [])];
      for (const userId of recipients) {
        const outcome = await sendOncePerDay(ctx, {
          template: 'CONTENT_OVERDUE',
          dealId: deal.id,
          userId,
          data: {
            dealShortId: deal.shortId,
            dealTitle: deal.title ?? '',
            contentUploadDeadline: deal.contentUploadDeadline ?? '',
          },
        });
        tally(counts, outcome);
      }
    }
    return counts;
  },
};
