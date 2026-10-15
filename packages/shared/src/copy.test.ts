import { describe, expect, it } from 'vitest';
import {
  CONTINUE_WITH_INSTAGRAM,
  SIGN_IN_WITH_EMAIL,
  payAdvanceLabel,
  DEAL_DESCRIPTION_TEMPLATE,
  payCommissionLabel,
  payFeeLabel,
  payFinalLabel,
} from './copy.js';

describe('payment CTA labels', () => {
  it('matches SPEC 5.5 exactly for the ₹10,000 worked example', () => {
    expect(payCommissionLabel(88_500)).toBe('Pay commission: ₹885.00');
    expect(payFeeLabel(88_500)).toBe('Pay ValueSkins fee: ₹885.00');
    expect(payAdvanceLabel(273_450)).toBe('Pay advance: ₹2,734.50');
    expect(payFinalLabel(638_050)).toBe('Pay final: ₹6,380.50');
  });
});

describe('sign-in labels', () => {
  it('has the two homepage sign-in labels', () => {
    expect(CONTINUE_WITH_INSTAGRAM).toBe('Continue with Instagram');
    expect(SIGN_IN_WITH_EMAIL).toBe('Sign in with email');
  });
});

describe('the deal description template', () => {
  it('follows the copy rules: money as rupees, dates as "1 to 3 Oct"', () => {
    expect(DEAL_DESCRIPTION_TEMPLATE).toContain('Travel allowance: ₹2,000.00');
    expect(DEAL_DESCRIPTION_TEMPLATE).toContain('Shooting 1 to 3 Oct, posting 5 to 7 Oct');
    expect(DEAL_DESCRIPTION_TEMPLATE).not.toMatch(/\bINR\b|Oct \d+-\d+/);
  });

  it('has the nine SPEC 9 headings and the notes line', () => {
    const lines = DEAL_DESCRIPTION_TEMPLATE.split('\n');
    expect(lines.slice(0, 9).map((l) => l.split(':')[0])).toEqual([
      'Content type',
      'Shooting',
      'Travel',
      'Timeline',
      'Approval',
      'Rights',
      'Deliverables',
      'Restrictions',
      'Delivery',
    ]);
    expect(lines.at(-1)).toBe('Additional notes:');
  });
});

describe('copy rules (CLAUDE.md section 12) for the strings in copy.ts', () => {
  it('has no em or en dashes, emojis or banned words in any string', async () => {
    const copy = await import('./copy.js');
    const strings = Object.values(copy).filter((v): v is string => typeof v === 'string');
    expect(strings.length).toBeGreaterThan(30);
    for (const text of strings) {
      expect(text).not.toMatch(/[\u2013\u2014]/);
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(text).not.toMatch(
        /\b(unlock|seamless|seamlessly|powered by|effortless|supercharge|elevate)\b/i,
      );
    }
  });
});
