import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #4 (creator side): ValueSkins fee paid (SPEC 8) - notice only, no attachment. */
export function commissionPaidCreatorTemplate(
  data: EmailTemplateDataMap['COMMISSION_PAID_CREATOR'],
): EmailContent {
  const subject = `ValueSkins fee paid: ${data.dealTitle}`;
  const text = `The ValueSkins fee for "${data.dealTitle}" (${data.dealShortId}) has been paid. The deal is now confirmed.`;
  const html = renderHtml(
    `<p>The ValueSkins fee for "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) has been paid. The deal is now confirmed.</p>`,
  );
  return { subject, text, html };
}
