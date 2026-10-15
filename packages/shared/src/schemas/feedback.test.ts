import { describe, expect, it } from 'vitest';
import { DEAL_FEEDBACK_MAX, dealFeedbackSchema } from './feedback.js';

describe('dealFeedbackSchema', () => {
  it('accepts non-empty feedback', () => {
    expect(
      dealFeedbackSchema.safeParse({ feedback: 'Please reshoot the last scene.' }).success,
    ).toBe(true);
  });

  it('rejects empty and blank feedback', () => {
    expect(dealFeedbackSchema.safeParse({ feedback: '' }).success).toBe(false);
    expect(dealFeedbackSchema.safeParse({ feedback: '   \n\t ' }).success).toBe(false);
  });

  it('trims the text', () => {
    const result = dealFeedbackSchema.safeParse({ feedback: '  Reshoot the intro.  ' });
    expect(result.success && result.data.feedback).toBe('Reshoot the intro.');
  });

  it('allows 5,000 characters and refuses 5,001, counted after trimming', () => {
    expect(DEAL_FEEDBACK_MAX).toBe(5000);
    expect(dealFeedbackSchema.safeParse({ feedback: 'a'.repeat(5000) }).success).toBe(true);
    expect(dealFeedbackSchema.safeParse({ feedback: 'a'.repeat(5001) }).success).toBe(false);
    expect(dealFeedbackSchema.safeParse({ feedback: ` ${'a'.repeat(5000)} ` }).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    expect(dealFeedbackSchema.safeParse({ feedback: 'ok', extra: 1 }).success).toBe(false);
  });
});
