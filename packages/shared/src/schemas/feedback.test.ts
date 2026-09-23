import { describe, expect, it } from 'vitest';
import { dealFeedbackSchema } from './feedback.js';

describe('dealFeedbackSchema', () => {
  it('accepts non-empty feedback', () => {
    expect(
      dealFeedbackSchema.safeParse({ feedback: 'Please reshoot the last scene.' }).success,
    ).toBe(true);
  });

  it('rejects empty feedback', () => {
    expect(dealFeedbackSchema.safeParse({ feedback: '' }).success).toBe(false);
  });
});
