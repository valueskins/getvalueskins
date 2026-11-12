import { db } from '../db/client.js';
import { jobRuns } from '../db/schema/index.js';
import { istDayBounds } from './istDay.js';
import type { JobDefinition } from './types.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// The most recent time at or before `now` that a schedule fires, in India Standard Time (SPEC 14).
// It understands only the two shapes the jobs use: `M H * * *` (daily) and `M */N * * *` (every N
// hours, like `0 */6 * * *`). It throws on anything else, so a new kind of schedule fails a test,
// not production. India Standard Time has no daylight saving, so a day is always 24 hours.
export function mostRecentScheduledTime(schedule: string, now: Date): Date {
  const fields = schedule.trim().split(/\s+/);
  const [minuteField, hourField, ...rest] = fields;
  if (fields.length !== 5 || rest.some((f) => f !== '*') || !minuteField || !hourField) {
    throw new Error(`Unsupported job schedule "${schedule}"`);
  }
  const minute = Number(minuteField);
  if (!/^\d+$/.test(minuteField) || minute > 59) {
    throw new Error(`Unsupported job schedule "${schedule}"`);
  }

  let hours: number[];
  const every = /^\*\/(\d+)$/.exec(hourField);
  if (every) {
    const step = Number(every[1]);
    if (step < 1 || step > 23) throw new Error(`Unsupported job schedule "${schedule}"`);
    hours = [];
    for (let h = 0; h < 24; h += step) hours.push(h);
  } else if (/^\d+$/.test(hourField) && Number(hourField) < 24) {
    hours = [Number(hourField)];
  } else {
    throw new Error(`Unsupported job schedule "${schedule}"`);
  }

  const { start } = istDayBounds(now);
  let best: Date | null = null;
  for (const dayStart of [start.getTime() - DAY_MS, start.getTime()]) {
    for (const hour of hours) {
      const at = dayStart + hour * HOUR_MS + minute * MINUTE_MS;
      if (at <= now.getTime() && (!best || at > best.getTime())) best = new Date(at);
    }
  }
  // Yesterday's last slot is always before now, so a slot was found.
  return best as Date;
}

export interface MissedJob {
  job: JobDefinition;
  /** The scheduled time that has passed without a success since. */
  dueAt: Date;
}

/**
 * The jobs whose most recent scheduled time has passed with no success recorded since, in the order
 * given. A job with no record at all counts as missed.
 */
export async function findMissedJobs(
  jobs: readonly JobDefinition[],
  now: Date,
): Promise<MissedJob[]> {
  const rows = await db.select().from(jobRuns);
  const lastSuccess = new Map(rows.map((r) => [r.jobName, r.lastSuccessAt.getTime()]));
  const missed: MissedJob[] = [];
  for (const job of jobs) {
    const dueAt = mostRecentScheduledTime(job.schedule, now);
    const last = lastSuccess.get(job.name);
    if (last === undefined || last < dueAt.getTime()) missed.push({ job, dueAt });
  }
  return missed;
}
