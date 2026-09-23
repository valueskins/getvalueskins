import { describe, expect, it } from 'vitest';
import { dealCreateSchema, dealPublishSchema, dealUpdateSchema } from './deal.js';

describe('dealCreateSchema / dealUpdateSchema', () => {
  it('accepts an empty draft (all fields optional)', () => {
    expect(dealCreateSchema.safeParse({}).success).toBe(true);
    expect(dealUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a fully filled draft', () => {
    const result = dealCreateSchema.safeParse({
      title: '3 Instagram posts',
      description: 'Content type: 3 posts',
      budgetRupees: 10_000,
      applicationDeadline: '2026-10-01',
      contentUploadDeadline: '2026-10-05',
      dealDeadline: '2026-10-10',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-integer budget', () => {
    expect(dealCreateSchema.safeParse({ budgetRupees: 100.5 }).success).toBe(false);
  });

  it('rejects an invalid calendar date', () => {
    expect(dealCreateSchema.safeParse({ applicationDeadline: '2026-02-30' }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(dealCreateSchema.safeParse({ notAField: true }).success).toBe(false);
  });
});

describe('dealPublishSchema', () => {
  it('accepts an empty body', () => {
    expect(dealPublishSchema.safeParse({}).success).toBe(true);
  });

  it('rejects a non-empty body', () => {
    expect(dealPublishSchema.safeParse({ foo: 'bar' }).success).toBe(false);
  });
});
