import {
  computeBreakdown,
  formatInr,
  MAX_BUDGET_RUPEES,
  MIN_BUDGET_PAISE,
  rupeesToPaise,
  type MoneyBreakdown,
} from '@valueskins/shared';

/** The calculator's starting amount, in whole rupees: the worked example. */
export const EXAMPLE_RUPEES = '10000';

/** The calculator's largest amount: the largest budget a deal can have (the shared deal schema). */
export const MAX_RUPEES = MAX_BUDGET_RUPEES;

/** What someone typed, as whole-rupee digits only: no grouping, no leading zeros, at most the max. */
export function cleanDigits(typed: string): string {
  const digits = typed.replace(/\D/g, '').replace(/^0+/, '');
  // Anything past the largest deal stops at it, however many digits were pasted.
  if (digits.length > String(MAX_RUPEES).length || Number(digits) > MAX_RUPEES) {
    return String(MAX_RUPEES);
  }
  return digits;
}

/** Whole rupees, perhaps with a ₹ and grouping, as the no-script form sends them. */
const AMOUNT_PARAM = /^\s*₹?\s*\d[\d,\s]*$/;

/**
 * The calculator's amount from `?amount=`: anything that is not whole rupees is the worked example,
 * and an amount outside the range is clamped to it.
 */
export function initialDigits(
  param: string | string[] | undefined,
  minPaise: number = MIN_BUDGET_PAISE,
): string {
  const value = Array.isArray(param) ? param[0] : param;
  if (value === undefined || !AMOUNT_PARAM.test(value)) return EXAMPLE_RUPEES;
  const digits = cleanDigits(value);
  if (!digits) return EXAMPLE_RUPEES;
  const minRupees = Math.ceil(Math.max(minPaise, MIN_BUDGET_PAISE) / 100);
  return Number(digits) < minRupees ? String(minRupees) : digits;
}

/** The line under the field: the range of amounts the calculator takes. */
export function amountHint(configMinPaise: number): string {
  const min = Math.max(configMinPaise, MIN_BUDGET_PAISE);
  return `Whole rupees, ${formatInr(min)} to ${formatInr(rupeesToPaise(MAX_RUPEES))}.`;
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

/**
 * Advance widths in em of the figures' face (Bricolage Grotesque 700) and the field's (its display
 * cut, 800, condensed), both with tabular figures, so every digit is one width. They are measured
 * in the browser at the sizes these amounts are set at, and rounded up: the display cut grows wider
 * as it gets smaller (its optical size follows the font size), and small text rounds to whole
 * pixels. CSS sizes each amount to its box from them, so a long one shrinks instead of spilling.
 */
const FIGURE_EM = { digit: 0.615, ',': 0.2, '.': 0.285, '₹': 0.575 } as const;
const FIELD_EM = { digit: 0.52, ',': 0.215, '.': 0.215, '₹': 0.46 } as const;
/** Room for rounding, and for a fallback face while the web font loads. */
const SLACK = 1.03;

function widthEm(text: string, em: Record<'digit' | ',' | '.' | '₹', number>): number {
  let width = 0;
  for (const ch of text) width += ch === ',' || ch === '.' || ch === '₹' ? em[ch] : em.digit;
  return Math.round(width * SLACK * 1000) / 1000;
}

/** The width of a formatted amount, such as ₹9,99,115.00, in the figures' face, in em. */
export function figureEm(text: string): number {
  return widthEm(text, FIGURE_EM);
}

/** The width of the field's grouped digits, such as 10,00,000, in its face, in em. */
export function fieldEm(grouped: string): number {
  return widthEm(grouped, FIELD_EM);
}
