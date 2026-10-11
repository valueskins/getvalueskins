import { PAYMENT_RECORD_DISCLAIMER, formatInr } from '@valueskins/shared';
import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #5: Advance paid (SPEC 8) - sent to both parties when the creator confirms the money arrived.
 * The advance payment record is attached by the caller via send()'s attachments option. */
export function advancePaidTemplate(data: EmailTemplateDataMap['ADVANCE_PAID']): EmailContent {
  const amount = formatInr(data.advancePaise);
  const subject = `Advance confirmed: ${data.dealTitle}`;
  const text = `The creator confirmed the advance payment of ${amount} for "${data.dealTitle}" (${data.dealShortId}). ${PAYMENT_RECORD_DISCLAIMER} The advance payment record is attached.`;
  const html = renderHtml(
    `<p>The creator confirmed the advance payment of ${amount} for "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}).</p>` +
      `<p>${PAYMENT_RECORD_DISCLAIMER}</p>` +
      `<p>The advance payment record is attached.</p>`,
  );
  return { subject, text, html };
}
