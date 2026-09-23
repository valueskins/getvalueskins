import { describe, expect, it } from 'vitest';
import { applicationConfirmSchema, applicationCreateSchema } from './application.js';

describe('applicationCreateSchema / applicationConfirmSchema', () => {
  it('accepts an empty body', () => {
    expect(applicationCreateSchema.safeParse({}).success).toBe(true);
    expect(applicationConfirmSchema.safeParse({}).success).toBe(true);
  });

  it('rejects a non-empty body', () => {
    expect(applicationCreateSchema.safeParse({ message: 'pick me' }).success).toBe(false);
    expect(applicationConfirmSchema.safeParse({ message: 'ok' }).success).toBe(false);
  });
});
