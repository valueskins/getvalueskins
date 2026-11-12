import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { emailLog, jobRuns } from '../../src/db/schema/index.js';
import { feeReminderJob } from '../../src/jobs/feeReminder.js';
import { startScheduler } from '../../src/jobs/scheduler.js';
import type { JobDefinition } from '../../src/jobs/types.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { brandWithBilling, insertDeal } from '../helpers/deals.js';
import { jobCtx } from './helpers.js';

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

/** A moment in India Standard Time. */
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const TODAY = '2026-11-12';
const YESTERDAY = '2026-11-11';

/** A job that counts its runs. */
function countingJob(name: string, schedule: string, runMs = 0) {
  const job: JobDefinition & { runs: number } = {
    name,
    schedule,
    description: 'counts how often it runs',
    runs: 0,
    run: async () => {
      job.runs += 1;
      if (runMs) await new Promise((resolve) => setTimeout(resolve, runMs));
      return { done: 1 };
    },
  };
  return job;
}

async function succeededAt(jobName: string, at: Date) {
  await db
    .insert(jobRuns)
    .values({ jobName, lastSuccessAt: at })
    .onConflictDoUpdate({ target: jobRuns.jobName, set: { lastSuccessAt: at } });
}

const recorded = async (jobName: string) =>
  (await db.select().from(jobRuns).where(eq(jobRuns.jobName, jobName)))[0]?.lastSuccessAt;

describe('catching up after sleep', () => {
  it('waking at 07:05 India Standard Time runs each missed job once', async () => {
    const daily = countingJob('daily-early', '15 8 * * *'); // 08:15: yesterday's run is the latest slot
    const sixHourly = countingJob('six-hourly', '0 */6 * * *'); // the 06:00 slot was missed
    const lateNight = countingJob('late-night', '59 23 * * *'); // yesterday 23:59 was missed
    const upToDate = countingJob('up-to-date', '0 10 * * *');
    const never = countingJob('never-run', '0 10 * * *');
    const jobs = [daily, sixHourly, lateNight, upToDate, never];
    // The API went to sleep at 01:00: everything ran at its last slot before that, except what it missed.
    await succeededAt('daily-early', ist(YESTERDAY, '08:15'));
    await succeededAt('six-hourly', ist(TODAY, '00:00'));
    await succeededAt('late-night', ist(YESTERDAY, '23:58'));
    await succeededAt('up-to-date', ist(YESTERDAY, '10:00'));
    const now = ist(TODAY, '07:05');
    const scheduler = startScheduler(jobCtx(now), jobs);

    const results = await scheduler.catchUp();

    expect(results.map((r) => [r.job, r.status])).toEqual([
      ['six-hourly', 'ok'],
      ['late-night', 'ok'],
      ['never-run', 'ok'],
    ]);
    expect([daily, sixHourly, lateNight, upToDate, never].map((j) => j.runs)).toEqual([
      0, 1, 1, 0, 1,
    ]);
    expect(await recorded('six-hourly')).toEqual(now);

    // A second catch-up right away finds nothing to do.
    expect(await scheduler.catchUp()).toEqual([]);
    expect([daily, sixHourly, lateNight, upToDate, never].map((j) => j.runs)).toEqual([
      0, 1, 1, 0, 1,
    ]);
    await scheduler.stop();
  });

  it('a restart at 11:00 after a successful 10:00 run does not run the job again', async () => {
    const job = countingJob('daily-ten', '0 10 * * *');
    await succeededAt('daily-ten', ist(TODAY, '10:00'));
    const scheduler = startScheduler(jobCtx(ist(TODAY, '11:00')), [job]);

    expect(await scheduler.catchUp()).toEqual([]);

    expect(job.runs).toBe(0);
    await scheduler.stop();
  });

  it('two processes starting together run each job once', async () => {
    const first = countingJob('shared-a', '0 10 * * *', 200);
    const second = countingJob('shared-b', '0 */6 * * *', 200);
    const ctx = jobCtx(ist(TODAY, '11:00'));
    // Two schedulers stand for two processes: each has its own connections and finds the same jobs due.
    const one = startScheduler(ctx, [first, second]);
    const two = startScheduler(ctx, [first, second]);

    const [a, b] = await Promise.all([one.catchUp(), two.catchUp()]);

    expect(first.runs).toBe(1);
    expect(second.runs).toBe(1);
    const all = [...a, ...b];
    expect(all.filter((r) => r.status === 'ok')).toHaveLength(2);
    expect(all.filter((r) => r.status === 'skipped')).toHaveLength(2);
    await Promise.all([one.stop(), two.stop()]);
  });

  it('the six-hourly job catches up only when it missed its latest slot', async () => {
    const job = countingJob('every-six-hours', '0 */6 * * *');
    const now = ist(TODAY, '11:00'); // the latest slot is 06:00
    const scheduler = startScheduler(jobCtx(now), [job]);

    await succeededAt('every-six-hours', new Date(now.getTime() - 2 * 60 * 60 * 1000)); // 09:00
    expect(await scheduler.catchUp()).toEqual([]);
    expect(job.runs).toBe(0);

    await succeededAt('every-six-hours', new Date(now.getTime() - 7 * 60 * 60 * 1000)); // 04:00
    expect((await scheduler.catchUp()).map((r) => r.status)).toEqual(['ok']);
    expect(job.runs).toBe(1);
    await scheduler.stop();
  });

  it('a failed job records no success and is tried again at the next start', async () => {
    let attempts = 0;
    const flaky: JobDefinition = {
      name: 'flaky',
      schedule: '0 10 * * *',
      description: 'fails the first time',
      run: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('first attempt fails');
        return { done: 1 };
      },
    };
    const after = countingJob('after-flaky', '0 10 * * *');
    const ctx = jobCtx(ist(TODAY, '11:00'));

    const first = await startScheduler(ctx, [flaky, after]).catchUp();
    expect(first.map((r) => [r.job, r.status])).toEqual([
      ['flaky', 'failed'],
      ['after-flaky', 'ok'],
    ]);
    expect(await recorded('flaky')).toBeUndefined();

    const second = await startScheduler(ctx, [flaky, after]).catchUp();
    expect(second.map((r) => [r.job, r.status])).toEqual([['flaky', 'ok']]);
  });

  it('runs the jobs one after another', async () => {
    const order: string[] = [];
    const make = (name: string): JobDefinition => ({
      name,
      schedule: '0 10 * * *',
      description: 'records when it starts and ends',
      run: async () => {
        order.push(`${name} start`);
        await new Promise((resolve) => setTimeout(resolve, 50));
        order.push(`${name} end`);
        return {};
      },
    });
    const scheduler = startScheduler(jobCtx(ist(TODAY, '11:00')), [make('one'), make('two')]);

    await scheduler.catchUp();

    expect(order).toEqual(['one start', 'one end', 'two start', 'two end']);
    await scheduler.stop();
  });

  it('stop() waits for a running catch-up and starts no further job', async () => {
    const slow = countingJob('slow-first', '0 10 * * *', 300);
    const next = countingJob('never-started', '0 10 * * *');
    const scheduler = startScheduler(jobCtx(ist(TODAY, '11:00')), [slow, next]);

    const catching = scheduler.catchUp();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await scheduler.stop();
    await catching;

    expect(slow.runs).toBe(1);
    expect(next.runs).toBe(0);
  });

  it('a catch-up after a crash sends no second reminder the same India Standard Time day', async () => {
    const brand = await brandWithBilling();
    await insertDeal(brand.user.id, 'CONFIRMED', { confirmedAt: ist(YESTERDAY, '08:00') });
    const ctx = jobCtx(ist(TODAY, '10:00'));
    const sent = async () =>
      (await db.select().from(emailLog).where(eq(emailLog.template, 'COMMISSION_PAYMENT_REMINDER')))
        .length;

    // The 10:00 run sent the email, then the API died before it could record the success.
    await startScheduler(ctx, [feeReminderJob]).catchUp();
    expect(await sent()).toBe(1);
    await db.delete(jobRuns);

    const again = await startScheduler(jobCtx(ist(TODAY, '11:00')), [feeReminderJob]).catchUp();

    expect(again.map((r) => r.status)).toEqual(['ok']);
    expect(again[0]?.counts).toMatchObject({ alreadySent: 1 });
    expect(again[0]?.counts.sent ?? 0).toBe(0);
    expect(await sent()).toBe(1);
  });
});
