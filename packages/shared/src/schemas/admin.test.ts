import { describe, expect, it } from 'vitest';
import { adminCancelSchema, adminDealListQuerySchema, markManualSchema } from './admin.js';

describe('adminDealListQuerySchema', () => {
  it('accepts a status and a short id search', () => {
    expect(adminDealListQuerySchema.parse({ status: 'APPROVED', q: ' ab12cd34 ' })).toMatchObject({
      status: 'APPROVED',
      q: 'ab12cd34',
    });
  });

  it('rejects an unknown status, an empty or overlong search and unknown keys', () => {
    expect(adminDealListQuerySchema.safeParse({ status: 'LOST' }).success).toBe(false);
    expect(adminDealListQuerySchema.safeParse({ q: '   ' }).success).toBe(false);
    expect(adminDealListQuerySchema.safeParse({ q: 'ABCDEFGHJ' }).success).toBe(false);
    expect(adminDealListQuerySchema.safeParse({ sort: 'asc' }).success).toBe(false);
  });
});

describe('adminCancelSchema', () => {
  it('requires a note; the refund reference is optional', () => {
    expect(adminCancelSchema.safeParse({ note: 'Creator unreachable' }).success).toBe(true);
    expect(
      adminCancelSchema.safeParse({ note: 'Refunded', refundReference: 'rfnd_1' }).success,
    ).toBe(true);
    expect(adminCancelSchema.safeParse({}).success).toBe(false);
    expect(adminCancelSchema.safeParse({ note: '   ' }).success).toBe(false);
    expect(adminCancelSchema.safeParse({ note: 'x', extra: 1 }).success).toBe(false);
  });
});

describe('markManualSchema', () => {
  it('requires a reference', () => {
    expect(markManualSchema.safeParse({ reference: 'UTR123456' }).success).toBe(true);
    expect(markManualSchema.parse({ reference: ' UTR1 ' })).toEqual({ reference: 'UTR1' });
    expect(markManualSchema.safeParse({}).success).toBe(false);
    expect(markManualSchema.safeParse({ reference: '' }).success).toBe(false);
    expect(markManualSchema.safeParse({ reference: ' ' }).success).toBe(false);
    expect(markManualSchema.safeParse({ reference: 'x'.repeat(256) }).success).toBe(false);
  });
});
