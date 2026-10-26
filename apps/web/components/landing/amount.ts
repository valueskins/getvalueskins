import {
  computeBreakdown,
  MIN_BUDGET_PAISE,
  rupeesToPaise,
  type MoneyBreakdown,
} from '@valueskins/shared';

/** The calculator's starting amount, in whole rupees: the worked example. */
export const EXAMPLE_RUPEES = '10000';

/** Eleven digits is ₹99,999,999,999: far past any deal, and still a safe integer in paise. */
const MAX_DIGITS = 11;

/** What someone typed, as whole-rupee digits only: no grouping, no leading zeros. */
export function cleanDigits(typed: string): string {
  return typed.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS);
}

/** The `?amount=` of the no-script form, or the worked example when it is missing. */
export function initialDigits(param: string | string[] | undefined): string {
  const value = Array.isArray(param) ? param[0] : param;
  if (value === undefined) return EXAMPLE_RUPEES;
  return cleanDigits(value);
}

export type Quote =
  | { kind: 'empty' }
  | { kind: 'below'; minPaise: number; fee: MoneyBreakdown }
  | { kind: 'ok'; breakdown: MoneyBreakdown };

/**
 * The breakdown for typed digits, exactly as a published deal computes it. Below the minimum the
 * fee still shows, worked out at the minimum, because it is the same at every amount.
 */
export function quote(digits: string, configMinPaise: number, gstRateBps: number): Quote {
  if (!digits) return { kind: 'empty' };
  // computeBreakdown refuses anything under the shared minimum, so the floor is never lower.
  const minPaise = Math.max(configMinPaise, MIN_BUDGET_PAISE);
  const paise = rupeesToPaise(Number(digits));
  if (paise < minPaise) {
    return { kind: 'below', minPaise, fee: computeBreakdown(minPaise, gstRateBps) };
  }
  return { kind: 'ok', breakdown: computeBreakdown(paise, gstRateBps) };
}
