import { describe, expect, it } from 'vitest';
import { COMMISSION_FLAT_PAISE, GST_RATE_BPS, MIN_BUDGET_PAISE } from './config.js';
import { roundHalfUp } from './money.js';

describe('MIN_BUDGET_PAISE', () => {
  it('is above the whole fee, GST included, so a later fee change cannot slip under it', () => {
    const feeWithGst =
      COMMISSION_FLAT_PAISE + roundHalfUp(COMMISSION_FLAT_PAISE * GST_RATE_BPS, 10_000);

    expect(feeWithGst).toBe(88_500);
    expect(MIN_BUDGET_PAISE).toBeGreaterThan(feeWithGst);
  });

  it('is ₹886, in whole rupees', () => {
    expect(MIN_BUDGET_PAISE).toBe(88_600);
    expect(MIN_BUDGET_PAISE % 100).toBe(0);
  });
});
