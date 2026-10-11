import {
  ADVANCE_PERCENT,
  COMMISSION_FLAT_PAISE,
  COMMISSION_PERCENT_BPS,
  GST_RATE_BPS,
  MIN_BUDGET_PAISE,
} from './config.js';

export type MoneyErrorCode = 'NOT_SAFE_INTEGER' | 'BUDGET_BELOW_MINIMUM' | 'NOT_WHOLE_RUPEES';

export class MoneyError extends Error {
  readonly code: MoneyErrorCode;

  constructor(code: MoneyErrorCode, message: string) {
    super(message);
    this.name = 'MoneyError';
    this.code = code;
  }
}

export interface MoneyBreakdown {
  budgetPaise: number;
  commissionBasePaise: number;
  commissionGstPaise: number;
  commissionTotalPaise: number;
  creatorAmountPaise: number;
  advancePaise: number;
  finalPaise: number;
}

/**
 * Integer round-half-up of numerator/denominator, done entirely with BigInt
 * so no floating-point division ever enters the money path.
 */
export function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0) {
    throw new RangeError(
      `roundHalfUp: numerator must be a non-negative safe integer, got ${numerator}`,
    );
  }
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError(
      `roundHalfUp: denominator must be a positive safe integer, got ${denominator}`,
    );
  }

  const n = BigInt(numerator);
  const d = BigInt(denominator);
  const quotient = n / d;
  const remainder = n % d;

  return Number(remainder * 2n >= d ? quotient + 1n : quotient);
}

/**
 * `gstRateBps` defaults to the standard config rate but can be overridden —
 * V0 launches at 0% until ValueSkins is GST-registered (see docs/V0_LAUNCH.md 2.6).
 */
export function computeBreakdown(
  budgetPaise: number,
  gstRateBps: number = GST_RATE_BPS,
): MoneyBreakdown {
  if (!Number.isSafeInteger(budgetPaise)) {
    throw new MoneyError(
      'NOT_SAFE_INTEGER',
      `budgetPaise must be a safe integer, got ${budgetPaise}`,
    );
  }
  if (budgetPaise < MIN_BUDGET_PAISE) {
    throw new MoneyError(
      'BUDGET_BELOW_MINIMUM',
      `budgetPaise ${budgetPaise} is below the minimum of ${MIN_BUDGET_PAISE}`,
    );
  }

  const commissionBasePaise = Math.max(
    COMMISSION_FLAT_PAISE,
    roundHalfUp(budgetPaise * COMMISSION_PERCENT_BPS, 10_000),
  );
  const commissionGstPaise = roundHalfUp(commissionBasePaise * gstRateBps, 10_000);
  const commissionTotalPaise = commissionBasePaise + commissionGstPaise;
  const creatorAmountPaise = budgetPaise - commissionTotalPaise;
  const advancePaise = roundHalfUp(creatorAmountPaise * ADVANCE_PERCENT, 100);
  const finalPaise = creatorAmountPaise - advancePaise;

  return {
    budgetPaise,
    commissionBasePaise,
    commissionGstPaise,
    commissionTotalPaise,
    creatorAmountPaise,
    advancePaise,
    finalPaise,
  };
}

/** Whole rupees only — brands enter budgets in whole rupees, never paise or fractions. */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) {
    throw new MoneyError('NOT_SAFE_INTEGER', `rupees must be a finite number, got ${rupees}`);
  }
  if (!Number.isInteger(rupees)) {
    throw new MoneyError('NOT_WHOLE_RUPEES', `rupees must be a whole number, got ${rupees}`);
  }

  const paise = rupees * 100;
  if (!Number.isSafeInteger(paise)) {
    throw new MoneyError('NOT_SAFE_INTEGER', `rupees ${rupees} overflows a safe integer in paise`);
  }

  return paise;
}

const INR_DECIMAL_FORMATTER = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats paise as "₹10,000.00" with en-IN (Indian) digit grouping, for display only. */
export function formatInr(paise: number): string {
  if (!Number.isSafeInteger(paise)) {
    throw new MoneyError('NOT_SAFE_INTEGER', `paise must be a safe integer, got ${paise}`);
  }

  return `₹${INR_DECIMAL_FORMATTER.format(paise / 100)}`;
}

export interface GstSplit {
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

/**
 * SPEC 7.4: GST on the commission is CGST + SGST when the brand's state is the company's
 * state, IGST otherwise. The two halves always add up to the GST: the odd paisa goes to SGST.
 */
export function splitGst(gstPaise: number, sameState: boolean): GstSplit {
  if (!Number.isSafeInteger(gstPaise) || gstPaise < 0) {
    throw new MoneyError(
      'NOT_SAFE_INTEGER',
      `gstPaise must be a non-negative safe integer, got ${gstPaise}`,
    );
  }
  if (!sameState) return { cgstPaise: 0, sgstPaise: 0, igstPaise: gstPaise };
  const cgstPaise = Math.floor(gstPaise / 2);
  return { cgstPaise, sgstPaise: gstPaise - cgstPaise, igstPaise: 0 };
}

/**
 * Paise as a plain rupee amount with exactly two decimals ("2734.50"), for the `am` field of a
 * upi://pay link. Integer math only: no division, no floats.
 */
export function paiseToDecimalString(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) {
    throw new MoneyError(
      'NOT_SAFE_INTEGER',
      `paise must be a non-negative safe integer, got ${paise}`,
    );
  }
  const rupees = BigInt(paise) / 100n;
  const remainder = BigInt(paise) % 100n;
  return `${rupees}.${remainder.toString().padStart(2, '0')}`;
}
