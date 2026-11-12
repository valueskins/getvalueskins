import cron from 'node-cron';
import { JOBS, JOB_TIMEZONE } from './registry.js';
import { logger } from '../logging/logger.js';
import { findMissedJobs } from './schedule.js';
import { runJob } from './runJob.js';
import type { JobContext, JobDefinition, JobRunResult } from './types.js';

export interface Scheduler {
  /**
   * Runs the jobs that fell due while the API was asleep or restarting: those whose most recent
   * scheduled time has passed with no success recorded since (SPEC 14). One after another, each
   * through `runJob` and its advisory lock. Never throws. Call it once, after `startScheduler`.
   */
  catchUp(): Promise<JobRunResult[]>;
  /** Stops the schedules and waits for any job that is running. */
  stop(): Promise<void>;
}

/**
 * Starts every job on its schedule, in Asia/Kolkata time (SPEC 14). Each tick runs through
 * `runJob`, which takes the job's advisory lock, so a second instance or a deploy overlap cannot
 * double-run it. Started from `index.ts` only, never from `createApp`, so tests do not run jobs.
 */
export function startScheduler(ctx: JobContext, jobs: readonly JobDefinition[] = JOBS): Scheduler {
  const running = new Set<Promise<unknown>>();
  let stopped = false;

  const tasks = jobs.map((job) =>
    cron.schedule(
      job.schedule,
      () => {
        const run = runJob(job, ctx).finally(() => running.delete(run));
        running.add(run);
        return run;
      },
      { name: job.name, timezone: JOB_TIMEZONE, noOverlap: true },
    ),
  );

  async function catchUpMissedJobs(): Promise<JobRunResult[]> {
    const results: JobRunResult[] = [];
    try {
      const missed = await findMissedJobs(jobs, ctx.now());
      for (const { job, dueAt } of missed) {
        if (stopped) break;
        results.push(await runJob(job, ctx, { unlessSucceededSince: dueAt }));
      }
    } catch (error) {
      logger.error({ err: error }, 'job catch-up failed');
    }
    return results;
  }

  return {
    catchUp() {
      const run = catchUpMissedJobs().finally(() => running.delete(run));
      running.add(run);
      return run;
    },
    async stop() {
      stopped = true;
      for (const task of tasks) await task.destroy();
      await Promise.allSettled([...running]);
    },
  };
}
