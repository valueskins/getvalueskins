import type { ApiContext } from '../context.js';

/** What a job did, as counts. Keys must not contain "token", "code", "account" or "pan": the logger redacts those. */
export type JobCounts = Record<string, number>;

/** The same `{ env, now }` the routes use, plus a pause tests can replace. */
export interface JobContext extends ApiContext {
  sleep?: (ms: number) => Promise<void>;
}

export interface JobDefinition {
  /** The name used by `pnpm job <name>` and in the logs. */
  name: string;
  /** A cron expression, run in Asia/Kolkata. */
  schedule: string;
  description: string;
  run: (ctx: JobContext) => Promise<JobCounts>;
}

export type JobStatus = 'ok' | 'skipped' | 'failed';

export interface JobRunResult {
  job: string;
  status: JobStatus;
  durationMs: number;
  counts: JobCounts;
}
