import { describe, expect, it } from 'vitest';
import { devLoginSchema } from './auth.js';

describe('devLoginSchema', () => {
  it('accepts a valid dev login body', () => {
    expect(devLoginSchema.safeParse({ username: 'testcreator', role: 'CREATOR' }).success).toBe(
      true,
    );
  });

  it('rejects an invalid role', () => {
    expect(devLoginSchema.safeParse({ username: 'testcreator', role: 'ADMIN' }).success).toBe(
      false,
    );
  });

  it('takes an optional admin flag, and nothing else', () => {
    expect(devLoginSchema.parse({ username: 'a', role: 'BRAND', admin: true }).admin).toBe(true);
    expect(devLoginSchema.safeParse({ username: 'a', role: 'BRAND', admin: 'yes' }).success).toBe(
      false,
    );
    expect(devLoginSchema.safeParse({ username: 'a', role: 'BRAND', isAdmin: true }).success).toBe(
      false,
    );
  });

  it('rejects a missing username', () => {
    expect(devLoginSchema.safeParse({ role: 'CREATOR' }).success).toBe(false);
  });
});
