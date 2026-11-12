import cron from 'node-cron';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, resetDb } from '../db/testDb.js';
import { JOBS, JOB_TIMEZONE, findJob } from '../../src/jobs/registry.js';
import { startScheduler } from '../../src/jobs/scheduler.js';
import type { JobDefinition } from '../../src/jobs/types.js';
import { jobCtx } from './helpers.js';

beforeAll(resetDb);
afterAll(closeDb);

/** The schedule table of SPEC 14. */
const EXPECTED: Record<string, string> = {
  'instagram-refresh': '15 8 * * *',
  'fee-reminder': '0 10 * * *',
  'payment-due-reminder': '0 10 * * *',
  'confirm-payment-reminder': '0 */6 * * *',
  'review-reminder': '0 10 * * *',
  'content-overdue': '59 23 * * *',
  cleanup: '30 8 * * *',
};

describe('job registry', () => {
  it('has the seven jobs with the SPEC 14 schedules', () => {
    expect(Object.fromEntries(JOBS.map((j) => [j.name, j.schedule]))).toEqual(EXPECTED);
  });

  it('has unique names, valid cron expressions and a description', () => {
    expect(new Set(JOBS.map((j) => j.name)).size).toBe(JOBS.length);
    for (const job of JOBS) {
      expect(cron.validate(job.schedule)).toBe(true);
      expect(job.description.length).toBeGreaterThan(10);
    }
  });

  it('runs in Asia/Kolkata', () => {
    expect(JOB_TIMEZONE).toBe('Asia/Kolkata');
  });

  it('finds a job by name', () => {
    expect(findJob('cleanup')?.name).toBe('cleanup');
    expect(findJob('nope')).toBeUndefined();
  });
});

describe('startScheduler', () => {
  it('schedules every job, and the next runs fall at the IST times', async () => {
    const scheduler = startScheduler(jobCtx());
    try {
      const tasks = cron.getTasks();
      const next = (name: string) => {
        const task = [...tasks.values()].find((t) => t.name === name);
        return task?.getNextRun();
      };
      for (const job of JOBS) expect(next(job.name)).toBeInstanceOf(Date);

      // Whatever day it is, a daily 10:00 India Standard Time job runs at 04:30 UTC, and cleanup at 03:00 UTC.
      expect(next('fee-reminder')!.toISOString().slice(11, 16)).toBe('04:30');
      expect(next('instagram-refresh')!.toISOString().slice(11, 16)).toBe('02:45');
      expect(next('cleanup')!.toISOString().slice(11, 16)).toBe('03:00');
      expect(next('content-overdue')!.toISOString().slice(11, 16)).toBe('18:29');
      // Every 6 hours IST: 00:00, 06:00, 12:00 and 18:00 IST are 18:30, 00:30, 06:30 and 12:30 UTC.
      expect(['18:30', '00:30', '06:30', '12:30']).toContain(
        next('confirm-payment-reminder')!.toISOString().slice(11, 16),
      );
    } finally {
      await scheduler.stop();
    }
  });

  it('stop() removes the schedules', async () => {
    const before = cron.getTasks().size;
    const scheduler = startScheduler(jobCtx());
    expect(cron.getTasks().size).toBe(before + JOBS.length);
    await scheduler.stop();
    expect(cron.getTasks().size).toBe(before);
  });

  it('runs a job on its tick and stop() waits for it to finish', async () => {
    let finished = false;
    let started = false;
    const slow: JobDefinition = {
      name: 'slow-test-job',
      schedule: '* * * * * *', // every second
      description: 'a job that takes a while',
      run: async () => {
        started = true;
        await new Promise((resolve) => setTimeout(resolve, 300));
        finished = true;
        return { done: 1 };
      },
    };

    const scheduler = startScheduler(jobCtx(), [slow]);
    const deadline = Date.now() + 4000;
    while (!started && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    expect(started).toBe(true);
    expect(finished).toBe(false);

    await scheduler.stop();

    expect(finished).toBe(true);
  });
});
