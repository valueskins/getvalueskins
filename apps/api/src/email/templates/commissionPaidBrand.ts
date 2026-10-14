import { formatInr } from '@valueskins/shared';
import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #4 (brand side): ValueSkins fee paid (SPEC 8) — the tax invoice is attached by
 * the caller via send()'s attachments option, not built here. */
export function commissionPaidBrandTemplate(
  data: EmailTemplateDataMap['COMMISSION_PAID_BRAND'],
): EmailContent {
  const amount = formatInr(data.commissionTotalPaise);
  const subject = `ValueSkins fee paid: ${data.dealTitle}`;
  const text = `Your ValueSkins fee of ${amount} for "${data.dealTitle}" (${data.dealShortId}) was received. The invoice is attached.`;
  const html = renderHtml(
    `<p>Your ValueSkins fee of ${amount} for "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) was received.</p>` +
      `<p>The invoice is attached.</p>`,
  );
  return { subject, text, html };
}
