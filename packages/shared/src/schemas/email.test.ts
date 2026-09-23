import { describe, expect, it } from 'vitest';
import { meEmailSchema } from './email.js';

describe('meEmailSchema', () => {
  it('accepts a valid email', () => {
    expect(meEmailSchema.safeParse({ email: 'brand@example.com' }).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(meEmailSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });
});
