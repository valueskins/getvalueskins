import { describe, expect, it } from 'vitest';
import { disputeCreateSchema } from './dispute.js';

describe('disputeCreateSchema', () => {
  it('accepts a subject and description', () => {
    expect(
      disputeCreateSchema.safeParse({ subject: 'Late delivery', description: 'Deal is overdue' })
        .success,
    ).toBe(true);
  });

  it('rejects a missing description', () => {
    expect(disputeCreateSchema.safeParse({ subject: 'Late delivery' }).success).toBe(false);
  });
});
