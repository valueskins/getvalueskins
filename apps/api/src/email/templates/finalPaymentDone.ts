import { PAYMENT_RECORD_DISCLAIMER, formatInr } from '@valueskins/shared';
import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #9: Final payment done (SPEC 8) - sent to both parties when the creator confirms the money
 * arrived. The final payment record is attached by the caller via send()'s attachments option. */
export function finalPaymentDoneTemplate(
  data: EmailTemplateDataMap['FINAL_PAYMENT_DONE'],
): EmailContent {
  const amount = formatInr(data.finalPaise);
  const subject = `Final payment confirmed: ${data.dealTitle}`;
  const text = `The creator confirmed the final payment of ${amount} for "${data.dealTitle}" (${data.dealShortId}). ${PAYMENT_RECORD_DISCLAIMER} The final payment record is attached.`;
  const html = renderHtml(
    `<p>The creator confirmed the final payment of ${amount} for "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}).</p>` +
      `<p>${PAYMENT_RECORD_DISCLAIMER}</p>` +
      `<p>The final payment record is attached.</p>`,
  );
  return { subject, text, html };
}
