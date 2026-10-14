import { describe, expect, it } from 'vitest';
import {
  MAX_BUDGET_RUPEES,
  dealCreateSchema,
  dealMineQuerySchema,
  dealPublishSchema,
  dealUpdateSchema,
} from './deal.js';

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

  it('trims the title and caps it at the column width', () => {
    expect(dealCreateSchema.parse({ title: '  Reels  ' }).title).toBe('Reels');
    expect(dealCreateSchema.safeParse({ title: 'a'.repeat(256) }).success).toBe(false);
    expect(dealCreateSchema.safeParse({ title: 'a'.repeat(255) }).success).toBe(true);
    expect(dealCreateSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('has no description length limit', () => {
    expect(dealCreateSchema.safeParse({ description: 'x'.repeat(500_000) }).success).toBe(true);
  });

  it('accepts null to clear a field', () => {
    const cleared = {
      title: null,
      description: null,
      budgetRupees: null,
      applicationDeadline: null,
      contentUploadDeadline: null,
      dealDeadline: null,
    };
    expect(dealUpdateSchema.parse(cleared)).toEqual(cleared);
  });

  it('bounds the budget so money math stays in safe integers', () => {
    expect(dealCreateSchema.safeParse({ budgetRupees: MAX_BUDGET_RUPEES }).success).toBe(true);
    expect(dealCreateSchema.safeParse({ budgetRupees: MAX_BUDGET_RUPEES + 1 }).success).toBe(false);
    expect(dealCreateSchema.safeParse({ budgetRupees: 0 }).success).toBe(false);
  });
});

describe('dealMineQuerySchema', () => {
  it('accepts a status filter and rejects an unknown one', () => {
    expect(dealMineQuerySchema.parse({ status: 'DRAFT' }).status).toEqual(['DRAFT']);
    expect(dealMineQuerySchema.safeParse({ status: 'NOPE' }).success).toBe(false);
  });

  it('accepts several statuses separated by commas, once each', () => {
    expect(dealMineQuerySchema.parse({ status: 'OPEN,CONFIRMED' }).status).toEqual([
      'OPEN',
      'CONFIRMED',
    ]);
    expect(dealMineQuerySchema.parse({ status: ' OPEN , OPEN,APPROVED' }).status).toEqual([
      'OPEN',
      'APPROVED',
    ]);
    expect(dealMineQuerySchema.parse({}).status).toBeUndefined();
    for (const bad of ['', 'OPEN,', 'OPEN,NOPE', ',']) {
      expect(dealMineQuerySchema.safeParse({ status: bad }).success).toBe(false);
    }
    // A repeated query parameter arrives as a list, which is not the comma form.
    expect(dealMineQuerySchema.safeParse({ status: ['OPEN', 'CONFIRMED'] }).success).toBe(false);
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
