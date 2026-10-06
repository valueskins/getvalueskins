import { describe, expect, it } from 'vitest';
import { meEmailVerifySchema, meInstagramUsernameSchema, meRoleSchema } from './onboarding.js';

describe('meRoleSchema', () => {
  it('accepts CREATOR and BRAND only', () => {
    expect(meRoleSchema.safeParse({ role: 'CREATOR' }).success).toBe(true);
    expect(meRoleSchema.safeParse({ role: 'BRAND' }).success).toBe(true);
    expect(meRoleSchema.safeParse({ role: 'ADMIN' }).success).toBe(false);
    expect(meRoleSchema.safeParse({}).success).toBe(false);
  });
});

describe('meInstagramUsernameSchema', () => {
  const parse = (username: string) => meInstagramUsernameSchema.safeParse({ username });

  it('strips a leading @, trims and lowercases', () => {
    const result = parse('  @Jane.Doe_99 ');
    expect(result.success && result.data.username).toBe('jane.doe_99');
  });

  it('rejects empty, too long, and invalid characters', () => {
    expect(parse('').success).toBe(false);
    expect(parse('@').success).toBe(false);
    expect(parse('a'.repeat(31)).success).toBe(false);
    expect(parse('has space').success).toBe(false);
    expect(parse('bad-dash').success).toBe(false);
  });

  it('accepts exactly 30 characters', () => {
    expect(parse('a'.repeat(30)).success).toBe(true);
  });
});

describe('meEmailVerifySchema', () => {
  it('requires a token of plausible length', () => {
    expect(meEmailVerifySchema.safeParse({ token: 'x'.repeat(43) }).success).toBe(true);
    expect(meEmailVerifySchema.safeParse({ token: 'short' }).success).toBe(false);
    expect(meEmailVerifySchema.safeParse({}).success).toBe(false);
  });
});
