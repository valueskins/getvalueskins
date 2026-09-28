import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { renderHtml } from './layout.js';

/** #4 (creator side): Commission paid (SPEC 8) — notice only, no attachment. */
export function commissionPaidCreatorTemplate(
  data: EmailTemplateDataMap['COMMISSION_PAID_CREATOR'],
): EmailContent {
  const subject = `Commission paid: ${data.dealTitle}`;
  const text = `The commission for "${data.dealTitle}" (${data.dealShortId}) has been paid. The deal is now confirmed.`;
  const html = renderHtml(
    `<p>The commission for "${data.dealTitle}" (${data.dealShortId}) has been paid. The deal is now confirmed.</p>`,
  );
  return { subject, text, html };
}
