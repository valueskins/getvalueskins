/**
 * Creator payout details are a UPI ID, the name on the account and a consent time
 * (REPLACEMENT_PLAN 2.1). The pattern is used by the Zod schema and by the database CHECK.
 */
export const UPI_VPA_PATTERN_SOURCE = '^[a-zA-Z0-9.\\-_]{2,64}@[a-zA-Z]{2,32}$';
export const UPI_VPA_REGEX = new RegExp(UPI_VPA_PATTERN_SOURCE);

export const UPI_NAME_MIN = 2;
export const UPI_NAME_MAX = 80;

const BANK_ACCOUNT_SHAPE = /^\d{9,18}$/;
const PAN_SHAPE = /^[A-Za-z]{5}\d{4}[A-Za-z]$/;
const IFSC_SHAPE = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;

function squash(input: string): string {
  return input.replace(/[\s-]/g, '');
}

/** 9 to 18 digits, however it is spaced: the length of an Indian bank account number. */
export function looksLikeBankAccount(input: string): boolean {
  return BANK_ACCOUNT_SHAPE.test(squash(input));
}

export function looksLikePan(input: string): boolean {
  return PAN_SHAPE.test(squash(input));
}

export function looksLikeIfsc(input: string): boolean {
  return IFSC_SHAPE.test(squash(input));
}

const MASK = '•••';

/**
 * `cr•••@okhdfcbank`: the first two characters before the @ (one when there are only two),
 * then the handle. The only form of a UPI ID that is shown to anyone but the brand confirmed on
 * a deal (REPLACEMENT_PLAN 2.1). Never returns the input unchanged.
 */
export function maskVpa(vpa: string): string {
  const at = vpa.lastIndexOf('@');
  if (at < 1) return MASK;
  const local = vpa.slice(0, at);
  const handle = vpa.slice(at + 1);
  const shown = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, shown)}${MASK}@${handle}`;
}
