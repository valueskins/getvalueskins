import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COMMISSION_PERCENT_BPS, MIN_BUDGET_PAISE } from './config.js';
import {
  MoneyError,
  computeBreakdown,
  formatInr,
  paiseToDecimalString,
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

  it('matches the SPEC 4.2 worked example for budget ₹50,000: the fee is still ₹885', () => {
    const breakdown = computeBreakdown(5_000_000);

    expect(breakdown).toEqual({
      budgetPaise: 5_000_000,
      commissionBasePaise: 75_000,
      commissionGstPaise: 13_500,
      commissionTotalPaise: 88_500,
      creatorAmountPaise: 4_911_500,
      advancePaise: 1_473_450,
      finalPaise: 3_438_050,
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

  describe('flat fee (REPLACEMENT_PLAN 2.2)', () => {
    it.each([
      ['₹2,000', 200_000],
      ['₹5,000', 500_000],
      ['₹14,999', 1_499_900],
      ['₹15,001', 1_500_100],
      ['₹50,000', 5_000_000],
      ['₹1,00,000', 10_000_000],
      ['₹1 crore', 1_000_000_000],
    ])('charges ₹750 + 18%% GST = ₹885 at a budget of %s', (_label, budgetPaise) => {
      const breakdown = computeBreakdown(budgetPaise, 1800);

      expect(breakdown.commissionBasePaise).toBe(75_000);
      expect(breakdown.commissionGstPaise).toBe(13_500);
      expect(breakdown.commissionTotalPaise).toBe(88_500);
    });

    it('has no percentage component', () => {
      expect(COMMISSION_PERCENT_BPS).toBe(0);
    });

    it('splits what is left 30 / 70 and adds back to the budget at ₹1,00,000', () => {
      const breakdown = computeBreakdown(10_000_000, 1800);

      expect(breakdown.creatorAmountPaise).toBe(9_911_500);
      expect(breakdown.advancePaise).toBe(2_973_450);
      expect(breakdown.finalPaise).toBe(6_938_050);
      expect(breakdown.commissionTotalPaise + breakdown.advancePaise + breakdown.finalPaise).toBe(
        10_000_000,
      );
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

    it('matches the SPEC 4.2 worked example at ₹2,000 (fee ₹885.00, creator ₹1,115.00, advance ₹334.50, final ₹780.50)', () => {
      const b = computeBreakdown(2_000_00, 1800);

      expect(b.commissionBasePaise).toBe(750_00);
      expect(b.commissionGstPaise).toBe(135_00);
      expect(b.commissionTotalPaise).toBe(885_00);
      expect(b.creatorAmountPaise).toBe(1_115_00);
      expect(b.advancePaise).toBe(334_50);
      expect(b.finalPaise).toBe(780_50);
      expect(b.commissionTotalPaise + b.advancePaise + b.finalPaise).toBe(2_000_00);
    });

    it('succeeds exactly at the minimum budget', () => {
      const breakdown = computeBreakdown(MIN_BUDGET_PAISE);

      // ₹2,000 less the ₹885 fee leaves the creator ₹1,115.00: ₹334.50 in advance and ₹780.50 at the end.
      expect(breakdown).toEqual({
        budgetPaise: 200_000,
        commissionBasePaise: 75_000,
        commissionGstPaise: 13_500,
        commissionTotalPaise: 88_500,
        creatorAmountPaise: 111_500,
        advancePaise: 33_450,
        finalPaise: 78_050,
      });
      expect(breakdown.commissionTotalPaise + breakdown.advancePaise + breakdown.finalPaise).toBe(
        MIN_BUDGET_PAISE,
      );
    });
  });

  it('rounds an exact .5 paise GST boundary up, not down or to even (rate 18.01%)', () => {
    const breakdown = computeBreakdown(1_500_500, 1801);

    // commissionBasePaise = 75,000; GST = 75,000 * 1801 / 10000 = 13,507.5 exactly.
    expect(breakdown.commissionBasePaise).toBe(75_000);
    expect(breakdown.commissionGstPaise).toBe(13_508);
    expect(breakdown).toEqual({
      budgetPaise: 1_500_500,
      commissionBasePaise: 75_000,
      commissionGstPaise: 13_508,
      commissionTotalPaise: 88_508,
      creatorAmountPaise: 1_411_992,
      advancePaise: 423_598,
      finalPaise: 988_394,
    });
  });

  describe('configurable GST rate (the API passes its GST_RATE_BPS)', () => {
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

describe('paiseToDecimalString', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [30, '0.30'],
    [70, '0.70'],
    [100, '1.00'],
    [273450, '2734.50'],
    [88500, '885.00'],
    [200000, '2000.00'],
    [Number.MAX_SAFE_INTEGER, '90071992547409.91'],
  ])('%d paise is %s', (paise, expected) => {
    expect(paiseToDecimalString(paise)).toBe(expected);
  });

  it('refuses a negative, a fraction, a NaN and an unsafe integer', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => paiseToDecimalString(bad)).toThrow(MoneyError);
    }
  });

  it('formats the advance and final of the minimum budget as 334.50 and 780.50', () => {
    const b = computeBreakdown(MIN_BUDGET_PAISE, 1800);
    expect(paiseToDecimalString(b.advancePaise)).toBe('334.50');
    expect(paiseToDecimalString(b.finalPaise)).toBe('780.50');
  });

  it('agrees with computeBreakdown for an advance and a final', () => {
    const b = computeBreakdown(10_000_00, 1800);
    expect(paiseToDecimalString(b.advancePaise)).toBe((b.advancePaise / 100).toFixed(2));
    expect(paiseToDecimalString(b.finalPaise)).toBe((b.finalPaise / 100).toFixed(2));
  });
});
