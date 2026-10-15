import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../../src/db/client.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { jobCtx } from './helpers.js';

const lines: string[] = [];

// Capture what runJob logs, with the real redaction rules.
vi.mock('../../src/logging/logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/logging/logger.js')>();
  return {
    ...actual,
    logger: actual.buildLogger({ write: (line: string) => void lines.push(line) }),
  };
});

import { feeReminderJob } from '../../src/jobs/feeReminder.js';
import { runJob } from '../../src/jobs/runJob.js';
import { withAdvisoryLock } from '../../src/jobs/lock.js';
import type { JobDefinition } from '../../src/jobs/types.js';
import { brandWithBilling, insertDeal } from '../helpers/deals.js';
import { DAY, ago } from './helpers.js';

beforeAll(resetDb);
beforeEach(async () => {
  lines.length = 0;
  await truncateAll();
});
afterAll(closeDb);

const sleepJob = (name: string, ms: number, counts = { done: 1 }): JobDefinition => ({
  name,
  schedule: '* * * * *',
  description: 'test',
  run: async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return counts;
  },
});

const jobLines = () =>
  lines.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.job);

describe('runJob', () => {
  it('logs the job, the status, the duration and the counts, and nothing personal', async () => {
    const brand = await brandWithBilling();
    await insertDeal(brand.user.id, 'CONFIRMED', { confirmedAt: ago(2 * DAY) });

    const result = await runJob(feeReminderJob, jobCtx());

    expect(result).toMatchObject({
      job: 'fee-reminder',
      status: 'ok',
      counts: { selected: 1, sent: 1 },
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    const [line] = jobLines();
    expect(line).toMatchObject({ job: 'fee-reminder', status: 'ok', selected: 1, sent: 1 });
    expect(typeof line?.durationMs).toBe('number');
    // (The console email transport, used in tests only, prints its own lines; the job lines carry no address.)
    expect(JSON.stringify(jobLines())).not.toContain('@');
  });

  it('reports a job that throws as failed, logs the error, and does not throw', async () => {
    const boom: JobDefinition = {
      name: 'boom',
      schedule: '* * * * *',
      description: 'test',
      run: async () => {
        throw new Error('database exploded');
      },
    };

    const result = await runJob(boom, jobCtx());

    expect(result.status).toBe('failed');
    expect(jobLines()[0]).toMatchObject({ job: 'boom', status: 'failed', level: 50 });
  });

  it('skips a run while another holds the lock, and runs again once it is released', async () => {
    const job = sleepJob('held', 0);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const holder = withAdvisoryLock('held', () => held);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const skipped = await runJob(job, jobCtx());
    expect(skipped.status).toBe('skipped');
    expect(jobLines()[0]).toMatchObject({ job: 'held', status: 'skipped', reason: 'lock held' });

    release();
    await holder;
    expect((await runJob(job, jobCtx())).status).toBe('ok');
  });

  it('lets exactly one of two simultaneous runs of a job do the work', async () => {
    const job = sleepJob('twice', 300);

    const results = await Promise.all([runJob(job, jobCtx()), runJob(job, jobCtx())]);

    expect(results.map((r) => r.status).sort()).toEqual(['ok', 'skipped']);
  });

  it('two simultaneous runs of the fee reminder send the email once', async () => {
    const brand = await brandWithBilling();
    await insertDeal(brand.user.id, 'CONFIRMED', { confirmedAt: ago(2 * DAY) });

    const results = await Promise.all([
      runJob(feeReminderJob, jobCtx()),
      runJob(feeReminderJob, jobCtx()),
      runJob(feeReminderJob, jobCtx()),
    ]);

    // The lock keeps two runs from overlapping (the test above), but a run that
    // starts after another has finished is allowed, so how many report "ok"
    // depends on timing. What must hold every time: nothing fails, and the
    // email goes out once, from one run.
    expect(results.every((r) => r.status === 'ok' || r.status === 'skipped')).toBe(true);
    expect(results.some((r) => r.status === 'ok')).toBe(true);
    const sent = results.reduce((total, r) => total + Number(r.counts?.sent ?? 0), 0);
    expect(sent).toBe(1);
    const rows = await pool.query(
      "select * from email_log where template = 'COMMISSION_PAYMENT_REMINDER'",
    );
    expect(rows.rowCount).toBe(1);
  });

  it('does not block a different job', async () => {
    const [a, b] = await Promise.all([
      runJob(sleepJob('first', 200), jobCtx()),
      runJob(sleepJob('second', 10), jobCtx()),
    ]);
    expect([a.status, b.status]).toEqual(['ok', 'ok']);
  });

  it('releases the lock after a run, and after a run that fails', async () => {
    const failing: JobDefinition = {
      name: 'fails',
      schedule: '* * * * *',
      description: 'test',
      run: async () => {
        throw new Error('no');
      },
    };
    expect((await runJob(failing, jobCtx())).status).toBe('failed');
    expect((await runJob(failing, jobCtx())).status).toBe('failed');
    expect((await runJob(sleepJob('fine', 0), jobCtx())).status).toBe('ok');
    expect((await runJob(sleepJob('fine', 0), jobCtx())).status).toBe('ok');

    const { rows } = await pool.query(
      "select count(*)::int as n from pg_locks where locktype = 'advisory'",
    );
    expect(rows[0].n).toBe(0);
  });
});
