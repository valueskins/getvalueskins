import { describe, expect, it } from 'vitest';
import { JOBS } from '../../src/jobs/registry.js';
import { mostRecentScheduledTime } from '../../src/jobs/schedule.js';

/** A moment in India Standard Time, as the date and the time of day. */
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const recent = (schedule: string, at: Date) => mostRecentScheduledTime(schedule, at).toISOString();

describe('mostRecentScheduledTime', () => {
  it('finds today or yesterday for a daily job, either side of its time', () => {
    const daily = '15 8 * * *';
    expect(recent(daily, ist('2026-11-12', '08:15'))).toBe(
      ist('2026-11-12', '08:15').toISOString(),
    );
    expect(recent(daily, ist('2026-11-12', '08:14'))).toBe(
      ist('2026-11-11', '08:15').toISOString(),
    );
    expect(recent(daily, ist('2026-11-12', '23:59'))).toBe(
      ist('2026-11-12', '08:15').toISOString(),
    );
  });

  it('uses the India Standard Time day, not the UTC day', () => {
    // 00:30 India Standard Time on the 12th is still the 11th in UTC.
    expect(recent('59 23 * * *', ist('2026-11-12', '00:30'))).toBe(
      ist('2026-11-11', '23:59').toISOString(),
    );
  });

  it('crosses a month and a year boundary', () => {
    expect(recent('0 10 * * *', ist('2026-12-01', '09:00'))).toBe(
      ist('2026-11-30', '10:00').toISOString(),
    );
    expect(recent('0 10 * * *', ist('2027-01-01', '00:05'))).toBe(
      ist('2026-12-31', '10:00').toISOString(),
    );
  });

  it('finds the latest slot of an every-six-hours job', () => {
    const sixHourly = '0 */6 * * *';
    expect(recent(sixHourly, ist('2026-11-12', '07:05'))).toBe(
      ist('2026-11-12', '06:00').toISOString(),
    );
    expect(recent(sixHourly, ist('2026-11-12', '05:59'))).toBe(
      ist('2026-11-12', '00:00').toISOString(),
    );
    expect(recent(sixHourly, ist('2026-11-12', '00:00'))).toBe(
      ist('2026-11-12', '00:00').toISOString(),
    );
    expect(recent(sixHourly, ist('2026-11-12', '23:00'))).toBe(
      ist('2026-11-12', '18:00').toISOString(),
    );
  });

  it('throws on a schedule shape it does not understand', () => {
    for (const bad of [
      '* * * * *',
      '0 10 * * 1',
      '0 10 1 * *',
      '*/5 * * * *',
      '0 25 * * *',
      '0 */0 * * *',
      '0 10',
      '0 1-5 * * *',
    ]) {
      expect(() => mostRecentScheduledTime(bad, new Date())).toThrow(/Unsupported job schedule/);
    }
  });

  it('understands every schedule in the registry, so a new shape fails here and not in production', () => {
    const now = ist('2026-11-12', '07:05');
    for (const job of JOBS) {
      const at = mostRecentScheduledTime(job.schedule, now);
      expect(at.getTime(), job.name).toBeLessThanOrEqual(now.getTime());
      expect(now.getTime() - at.getTime(), job.name).toBeLessThan(24 * 60 * 60 * 1000);
    }
  });
});
