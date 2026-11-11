import { describe, expect, it } from 'vitest';
import { istDate } from '../../scripts/istDate.js';

describe('istDate (the demonstration seed dates)', () => {
  it('uses the India Standard Time day, not the UTC day', () => {
    expect(istDate(0, new Date('2026-11-10T18:29:59Z'))).toBe('2026-11-10');
    expect(istDate(0, new Date('2026-11-10T18:30:00Z'))).toBe('2026-11-11');
    expect(istDate(0, new Date('2026-11-10T18:45:00Z'))).toBe('2026-11-11');
  });

  it('adds and subtracts whole days across month and year boundaries', () => {
    const now = new Date('2026-12-30T06:00:00Z');
    expect(istDate(2, now)).toBe('2027-01-01');
    expect(istDate(-30, now)).toBe('2026-11-30');
    expect(istDate(14, new Date('2026-11-11T06:00:00Z'))).toBe('2026-11-25');
  });
});
