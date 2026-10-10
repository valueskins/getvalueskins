import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MIN_BUDGET_PAISE } from './config.js';
import {
  MoneyError,
  computeBreakdown,
  formatInr,
  roundHalfUp,
  rupeesToPaise,
  splitGst,
} from './money.js';

describe('computeBreakdown', () => {
  it('matches the SPEC 4.2 worked example for budget ₹10,000', () => {
    const breakdown = computeBreakdown(1_000_000);

    expect(breakdown).toEqual({
      budgetPaise: 1_000_000,
      commissionBasePaise: 75_000,
      commissionGstPaise: 13_500,
      commissionTotalPaise: 88_500,
      creatorAmountPaise: 911_500,
      advancePaise: 273_450,
      finalPaise: 638_050,
    });
  });

  it('matches the SPEC 4.2 worked example for budget ₹50,000', () => {
    const breakdown = computeBreakdown(5_000_000);

    expect(breakdown).toEqual({
      budgetPaise: 5_000_000,
      commissionBasePaise: 250_000,
      commissionGstPaise: 45_000,
      commissionTotalPaise: 295_000,
      creatorAmountPaise: 4_705_000,
      advancePaise: 1_411_500,
      finalPaise: 3_293_500,
    });
  });

  it('satisfies commissionTotal + advance + final == budget for many random budgets', () => {
    fc.assert(
      fc.property(fc.integer({ min: MIN_BUDGET_PAISE, max: 100_000_000_00 }), (budgetPaise) => {
        const breakdown = computeBreakdown(budgetPaise);

        expect(breakdown.commissionTotalPaise + breakdown.advancePaise + breakdown.finalPaise).toBe(
          budgetPaise,
        );
        expect(breakdown.commissionBasePaise).toBeGreaterThan(0);
        expect(breakdown.commissionGstPaise).toBeGreaterThan(0);
        expect(breakdown.advancePaise).toBeGreaterThan(0);
        expect(breakdown.finalPaise).toBeGreaterThan(0);
      }),
    );
  });

  describe('crossover at ₹15,000 between the flat and percent commission', () => {
    it('uses the flat commission just below the crossover (₹14,999)', () => {
      expect(computeBreakdown(1_499_900).commissionBasePaise).toBe(75_000);
    });

    it('gives the same amount for both paths exactly at the crossover (₹15,000)', () => {
      expect(computeBreakdown(1_500_000).commissionBasePaise).toBe(75_000);
    });

    it('uses the percent commission just above the crossover (₹15,001)', () => {
      expect(computeBreakdown(1_500_100).commissionBasePaise).toBe(75_005);
    });
  });

  describe('minimum budget', () => {
    it('throws BUDGET_BELOW_MINIMUM just below the minimum', () => {
      expect(() => computeBreakdown(MIN_BUDGET_PAISE - 1)).toThrow(MoneyError);
      try {
        computeBreakdown(MIN_BUDGET_PAISE - 1);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(MoneyError);
        expect((error as MoneyError).code).toBe('BUDGET_BELOW_MINIMUM');
      }
    });

    it('succeeds exactly at the minimum budget', () => {
      const breakdown = computeBreakdown(MIN_BUDGET_PAISE);

      expect(breakdown).toEqual({
        budgetPaise: 500_000,
        commissionBasePaise: 75_000,
        commissionGstPaise: 13_500,
        commissionTotalPaise: 88_500,
        creatorAmountPaise: 411_500,
        advancePaise: 123_450,
        finalPaise: 288_050,
      });
      expect(breakdown.commissionTotalPaise + breakdown.advancePaise + breakdown.finalPaise).toBe(
        MIN_BUDGET_PAISE,
      );
    });
  });

  it('rounds an exact .5 paise GST boundary up, not down or to even (budget ₹15,005)', () => {
    const breakdown = computeBreakdown(1_500_500);

    // commissionBasePaise = 75,025 (exact); GST = 75,025 * 1800 / 10000 = 13,504.5 exactly.
    expect(breakdown.commissionBasePaise).toBe(75_025);
    expect(breakdown.commissionGstPaise).toBe(13_505);
    expect(breakdown).toEqual({
      budgetPaise: 1_500_500,
      commissionBasePaise: 75_025,
      commissionGstPaise: 13_505,
      commissionTotalPaise: 88_530,
      creatorAmountPaise: 1_411_970,
      advancePaise: 423_591,
      finalPaise: 988_379,
    });
  });

  describe('configurable GST rate (V0_LAUNCH 2.6)', () => {
    it('charges no GST at all when gstRateBps is 0', () => {
      const breakdown = computeBreakdown(1_000_000, 0);

      expect(breakdown).toEqual({
        budgetPaise: 1_000_000,
        commissionBasePaise: 75_000,
        commissionGstPaise: 0,
        commissionTotalPaise: 75_000,
        creatorAmountPaise: 925_000,
        advancePaise: 277_500,
        finalPaise: 647_500,
      });
    });

    it('still satisfies the invariant at GST 0 for many random budgets', () => {
      fc.assert(
        fc.property(fc.integer({ min: MIN_BUDGET_PAISE, max: 100_000_000_00 }), (budgetPaise) => {
          const breakdown = computeBreakdown(budgetPaise, 0);

          expect(breakdown.commissionGstPaise).toBe(0);
          expect(
            breakdown.commissionTotalPaise + breakdown.advancePaise + breakdown.finalPaise,
          ).toBe(budgetPaise);
        }),
      );
    });

    it('defaults to the standard config rate when no rate is given', () => {
      expect(computeBreakdown(1_000_000).commissionGstPaise).toBe(
        computeBreakdown(1_000_000, 1800).commissionGstPaise,
      );
    });
  });

  it('throws NOT_SAFE_INTEGER for non-integer paise', () => {
    expect(() => computeBreakdown(1.5)).toThrow(MoneyError);
    try {
      computeBreakdown(1.5);
      expect.unreachable();
    } catch (error) {
      expect((error as MoneyError).code).toBe('NOT_SAFE_INTEGER');
    }
  });
});

describe('roundHalfUp', () => {
  it('rounds an exact half up', () => {
    expect(roundHalfUp(5, 2)).toBe(3); // 2.5 -> 3
  });

  it('rounds down when below half', () => {
    expect(roundHalfUp(4, 10)).toBe(0); // 0.4 -> 0
  });

  it('rounds up when above half', () => {
    expect(roundHalfUp(6, 10)).toBe(1); // 0.6 -> 1
  });

  it('handles an exact division with no remainder', () => {
    expect(roundHalfUp(100, 10)).toBe(10);
  });
});

describe('rupeesToPaise', () => {
  it('converts whole rupees to paise', () => {
    expect(rupeesToPaise(10_000)).toBe(1_000_000);
  });

  it('throws NOT_WHOLE_RUPEES for a fractional rupee amount', () => {
    expect(() => rupeesToPaise(100.5)).toThrow(MoneyError);
    try {
      rupeesToPaise(100.5);
      expect.unreachable();
    } catch (error) {
      expect((error as MoneyError).code).toBe('NOT_WHOLE_RUPEES');
    }
  });

  it('throws NOT_SAFE_INTEGER for NaN', () => {
    try {
      rupeesToPaise(NaN);
      expect.unreachable();
    } catch (error) {
      expect((error as MoneyError).code).toBe('NOT_SAFE_INTEGER');
    }
  });

  it('throws NOT_SAFE_INTEGER for Infinity', () => {
    try {
      rupeesToPaise(Infinity);
      expect.unreachable();
    } catch (error) {
      expect((error as MoneyError).code).toBe('NOT_SAFE_INTEGER');
    }
  });
});

describe('formatInr', () => {
  it('formats the SPEC 4.2 worked-example amounts', () => {
    expect(formatInr(1_000_000)).toBe('₹10,000.00');
    expect(formatInr(273_450)).toBe('₹2,734.50');
    expect(formatInr(638_050)).toBe('₹6,380.50');
    expect(formatInr(88_500)).toBe('₹885.00');
  });

  it('uses Indian (lakh) digit grouping above one lakh', () => {
    expect(formatInr(250_000_000)).toBe('₹25,00,000.00');
  });

  it('contains no non-breaking spaces', () => {
    expect(formatInr(1_000_000)).not.toContain(' ');
  });
});

describe('splitGst', () => {
  it('splits evenly into CGST and SGST within a state', () => {
    expect(splitGst(13_500, true)).toEqual({ cgstPaise: 6_750, sgstPaise: 6_750, igstPaise: 0 });
  });

  it('gives the odd paisa to SGST so the halves add up', () => {
    const split = splitGst(13_501, true);
    expect(split).toEqual({ cgstPaise: 6_750, sgstPaise: 6_751, igstPaise: 0 });
    expect(split.cgstPaise + split.sgstPaise).toBe(13_501);
  });

  it('is all IGST across states', () => {
    expect(splitGst(13_501, false)).toEqual({ cgstPaise: 0, sgstPaise: 0, igstPaise: 13_501 });
  });

  it('handles zero GST', () => {
    expect(splitGst(0, true)).toEqual({ cgstPaise: 0, sgstPaise: 0, igstPaise: 0 });
    expect(splitGst(0, false)).toEqual({ cgstPaise: 0, sgstPaise: 0, igstPaise: 0 });
  });

  it('rejects negative and fractional amounts', () => {
    expect(() => splitGst(-1, true)).toThrow();
    expect(() => splitGst(1.5, false)).toThrow();
  });
});
