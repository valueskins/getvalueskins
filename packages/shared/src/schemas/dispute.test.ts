import { describe, expect, it } from 'vitest';
import {
  DISPUTE_SUBJECT_MAX,
  DISPUTE_TEXT_MAX,
  disputeCreateSchema,
  disputeListQuerySchema,
  disputeResolveSchema,
} from './dispute.js';

describe('disputeCreateSchema', () => {
  it('accepts a subject and description and trims them', () => {
    const parsed = disputeCreateSchema.parse({
      subject: ' Late delivery ',
      description: ' Overdue ',
    });
    expect(parsed).toEqual({ subject: 'Late delivery', description: 'Overdue' });
  });

  it('rejects a missing description', () => {
    expect(disputeCreateSchema.safeParse({ subject: 'Late delivery' }).success).toBe(false);
  });

  it('rejects blank and whitespace-only text', () => {
    expect(disputeCreateSchema.safeParse({ subject: '   ', description: 'x' }).success).toBe(false);
    expect(disputeCreateSchema.safeParse({ subject: 'x', description: '' }).success).toBe(false);
  });

  it('rejects text over the limits', () => {
    const long = (n: number) => 'a'.repeat(n);
    expect(
      disputeCreateSchema.safeParse({ subject: long(DISPUTE_SUBJECT_MAX + 1), description: 'x' })
        .success,
    ).toBe(false);
    expect(
      disputeCreateSchema.safeParse({ subject: 'x', description: long(DISPUTE_TEXT_MAX + 1) })
        .success,
    ).toBe(false);
    expect(
      disputeCreateSchema.safeParse({
        subject: long(DISPUTE_SUBJECT_MAX),
        description: long(DISPUTE_TEXT_MAX),
      }).success,
    ).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(
      disputeCreateSchema.safeParse({ subject: 'x', description: 'y', status: 'RESOLVED' }).success,
    ).toBe(false);
  });
});

describe('disputeResolveSchema', () => {
  it('needs a resolution; the refund reference is optional', () => {
    expect(disputeResolveSchema.safeParse({ resolution: 'Refunded in full' }).success).toBe(true);
    expect(
      disputeResolveSchema.safeParse({ resolution: 'Refunded', refundReference: 'rfnd_123' })
        .success,
    ).toBe(true);
    expect(disputeResolveSchema.safeParse({}).success).toBe(false);
    expect(disputeResolveSchema.safeParse({ resolution: '  ' }).success).toBe(false);
  });

  it('rejects a blank refund reference and unknown keys', () => {
    expect(disputeResolveSchema.safeParse({ resolution: 'x', refundReference: ' ' }).success).toBe(
      false,
    );
    expect(disputeResolveSchema.safeParse({ resolution: 'x', status: 'OPEN' }).success).toBe(false);
  });
});

describe('disputeListQuerySchema', () => {
  it('takes an optional status and the usual paging', () => {
    expect(disputeListQuerySchema.parse({ status: 'OPEN', limit: '5' })).toEqual({
      status: 'OPEN',
      limit: 5,
    });
    expect(disputeListQuerySchema.safeParse({ status: 'CLOSED' }).success).toBe(false);
  });
});
