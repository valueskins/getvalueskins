import { describe, expect, it } from 'vitest';
import { payAdvanceLabel, payCommissionLabel, payFinalLabel } from './copy.js';

describe('payment CTA labels', () => {
  it('matches SPEC 5.5 exactly for the ₹10,000 worked example', () => {
    expect(payCommissionLabel(88_500)).toBe('Pay commission: ₹885.00');
    expect(payAdvanceLabel(273_450)).toBe('Pay advance: ₹2,734.50');
    expect(payFinalLabel(638_050)).toBe('Pay final: ₹6,380.50');
  });
});
