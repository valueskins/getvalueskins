import type { DirectPaymentStage } from './enums.js';
import { paiseToDecimalString } from './money.js';

/** The parameters of a upi://pay link (REPLACEMENT_PLAN 2.1). `am` always has two decimals. */
export interface UpiPayFields {
  pa: string;
  pn: string;
  am: string;
  cu: 'INR';
  tn: string;
}

/**
 * The link fields for paying one stage of a deal. The amount is the frozen breakdown's, formatted
 * with integer math; the note names the deal so the creator can match it in their UPI app.
 */
export function buildUpiPay(input: {
  vpa: string;
  name: string;
  amountPaise: number;
  dealShortId: string;
  stage: DirectPaymentStage;
}): UpiPayFields {
  return {
    pa: input.vpa,
    pn: input.name,
    am: paiseToDecimalString(input.amountPaise),
    cu: 'INR',
    tn: `ValueSkins ${input.dealShortId} ${input.stage === 'ADVANCE' ? 'advance' : 'final'}`,
  };
}

/** `upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...` with every value URL-encoded. */
export function upiPayUri(fields: UpiPayFields): string {
  const query = (Object.keys(fields) as Array<keyof UpiPayFields>)
    .map((key) => `${key}=${encodeURIComponent(fields[key])}`)
    .join('&');
  return `upi://pay?${query}`;
}
