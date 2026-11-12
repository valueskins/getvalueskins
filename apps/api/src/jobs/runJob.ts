import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { jobRuns } from '../db/schema/index.js';
import { logger } from '../logging/logger.js';
import { captureError } from '../observability/sentry.js';
import { withAdvisoryLock } from './lock.js';
import type { JobContext, JobCounts, JobDefinition, JobRunResult } from './types.js';

export interface RunJobOptions {
  /**
   * Skip the run when the job already succeeded at or after this time. Checked after the lock is
   * taken, so two processes that start together and both find the job due run it once.
   */
  unlessSucceededSince?: Date;
}

type Ran = { ran: true; counts: JobCounts } | { ran: false };

/**
 * One run of a job: take its advisory lock, run it, and log one line with the status, the
 * duration and the counts (SPEC 14). A successful run is recorded in `job_runs`, which the
 * catch-up at startup reads. It never throws: a failing job is logged and reported as `failed`,
 * and a run that finds the lock taken, or the job already done, is `skipped`.
 */
export async function runJob(
  job: JobDefinition,
  ctx: JobContext,
  options: RunJobOptions = {},
): Promise<JobRunResult> {
  const startedAt = Date.now();
  let counts: JobCounts = {};
  try {
    const result = await withAdvisoryLock(job.name, async (): Promise<Ran> => {
      const since = options.unlessSucceededSince;
      if (since) {
        const last = await lastSuccessOf(job.name);
        if (last && last.getTime() >= since.getTime()) return { ran: false };
      }
      const startedAtClock = ctx.now();
      const ranCounts = await job.run(ctx);
      await recordSuccess(job.name, startedAtClock);
      return { ran: true, counts: ranCounts };
    });
    const durationMs = Date.now() - startedAt;
    if (!result.acquired || !result.value.ran) {
      logger.info(
        {
          job: job.name,
          status: 'skipped',
          durationMs,
          reason: result.acquired ? 'already run' : 'lock held',
        },
        'job skipped',
      );
      return { job: job.name, status: 'skipped', durationMs, counts };
    }
    counts = result.value.counts;
    logger.info({ job: job.name, status: 'ok', durationMs, ...counts }, 'job finished');
    return { job: job.name, status: 'ok', durationMs, counts };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger.error({ job: job.name, status: 'failed', durationMs, err: error }, 'job failed');
    captureError(error, `job ${job.name}`);
    return { job: job.name, status: 'failed', durationMs, counts };
  }
}

async function lastSuccessOf(jobName: string): Promise<Date | null> {
  const rows = await db.select().from(jobRuns).where(eq(jobRuns.jobName, jobName));
  return rows[0]?.lastSuccessAt ?? null;
}

/**
 * Notes the start time of a successful run, never moving it backwards. The work is already done,
 * so a failed write is logged and reported but does not fail the run: the worst case is one more
 * run at the next start, and reminders send at most one email per deal per day.
 */
async function recordSuccess(jobName: string, at: Date): Promise<void> {
  try {
    await db
      .insert(jobRuns)
      .values({ jobName, lastSuccessAt: at })
      .onConflictDoUpdate({
        target: jobRuns.jobName,
        set: { lastSuccessAt: at },
        setWhere: sql`${jobRuns.lastSuccessAt} < ${at.toISOString()}::timestamptz`,
      });
  } catch (error) {
    logger.error({ job: jobName, err: error }, 'job success could not be recorded');
    captureError(error, `job ${jobName} record`);
  }
}
