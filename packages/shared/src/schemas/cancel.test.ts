import { describe, expect, it } from 'vitest';
import { dealCancelSchema } from './cancel.js';

describe('dealCancelSchema', () => {
  it('accepts a non-empty reason', () => {
    expect(dealCancelSchema.safeParse({ reason: 'Creator unresponsive' }).success).toBe(true);
  });

  it('rejects an empty reason', () => {
    expect(dealCancelSchema.safeParse({ reason: '' }).success).toBe(false);
  });
});
