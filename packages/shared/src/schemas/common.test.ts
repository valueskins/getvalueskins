import { describe, expect, it } from 'vitest';
import { dateStringSchema } from './common.js';

describe('dateStringSchema', () => {
  it('accepts a valid calendar date', () => {
    expect(dateStringSchema.safeParse('2026-10-01').success).toBe(true);
  });

  it('rejects a malformed date string', () => {
    expect(dateStringSchema.safeParse('01-10-2026').success).toBe(false);
  });

  it('rejects an invalid calendar date', () => {
    expect(dateStringSchema.safeParse('2026-02-30').success).toBe(false);
  });
});
