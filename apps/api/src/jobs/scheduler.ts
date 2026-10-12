import cron from 'node-cron';
import { JOBS, JOB_TIMEZONE } from './registry.js';
import { runJob } from './runJob.js';
import type { JobContext, JobDefinition } from './types.js';

export interface Scheduler {
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

  return {
    async stop() {
      for (const task of tasks) await task.destroy();
      await Promise.allSettled([...running]);
    },
  };
}
