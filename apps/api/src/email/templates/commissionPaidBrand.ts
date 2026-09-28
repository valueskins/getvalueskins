import { formatInr } from '@valueskins/shared';
import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { renderHtml } from './layout.js';

/** #4 (brand side): Commission paid (SPEC 8) — the tax invoice is attached by
 * the caller via send()'s attachments option, not built here. */
export function commissionPaidBrandTemplate(
  data: EmailTemplateDataMap['COMMISSION_PAID_BRAND'],
): EmailContent {
  const amount = formatInr(data.commissionTotalPaise);
  const subject = `Commission paid: ${data.dealTitle}`;
  const text = `Your commission payment of ${amount} for "${data.dealTitle}" (${data.dealShortId}) was received. The tax invoice is attached.`;
  const html = renderHtml(
    `<p>Your commission payment of ${amount} for "${data.dealTitle}" (${data.dealShortId}) was received.</p>` +
      `<p>The tax invoice is attached.</p>`,
  );
  return { subject, text, html };
}
