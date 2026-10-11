import { describe, expect, it } from 'vitest';
import { meEmailVerifySchema } from './onboarding.js';

describe('meEmailVerifySchema', () => {
  it('requires a token of plausible length', () => {
    expect(meEmailVerifySchema.safeParse({ token: 'x'.repeat(43) }).success).toBe(true);
    expect(meEmailVerifySchema.safeParse({ token: 'short' }).success).toBe(false);
    expect(meEmailVerifySchema.safeParse({}).success).toBe(false);
  });
});
