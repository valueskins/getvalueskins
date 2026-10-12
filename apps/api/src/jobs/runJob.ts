import { logger } from '../logging/logger.js';
import { withAdvisoryLock } from './lock.js';
import type { JobContext, JobCounts, JobDefinition, JobRunResult } from './types.js';

/**
 * One run of a job: take its advisory lock, run it, and log one line with the status, the
 * duration and the counts (SPEC 14). It never throws: a failing job is logged and reported as
 * `failed`, and a run that finds the lock taken is `skipped`.
 */
export async function runJob(job: JobDefinition, ctx: JobContext): Promise<JobRunResult> {
  const startedAt = Date.now();
  let counts: JobCounts = {};
  try {
    const result = await withAdvisoryLock(job.name, () => job.run(ctx));
    const durationMs = Date.now() - startedAt;
    if (!result.acquired) {
      logger.info(
        { job: job.name, status: 'skipped', durationMs, reason: 'lock held' },
        'job skipped',
      );
      return { job: job.name, status: 'skipped', durationMs, counts };
    }
    counts = result.value;
    logger.info({ job: job.name, status: 'ok', durationMs, ...counts }, 'job finished');
    return { job: job.name, status: 'ok', durationMs, counts };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger.error({ job: job.name, status: 'failed', durationMs, err: error }, 'job failed');
    return { job: job.name, status: 'failed', durationMs, counts };
  }
}
