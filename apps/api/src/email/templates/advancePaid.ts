import { SETTLEMENT_TIMING_NOTE, formatInr } from '@valueskins/shared';
import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { renderHtml } from './layout.js';

/** #5: Advance paid (SPEC 8) — sent to both parties; the advance receipt is
 * attached by the caller via send()'s attachments option. */
export function advancePaidTemplate(data: EmailTemplateDataMap['ADVANCE_PAID']): EmailContent {
  const amount = formatInr(data.advancePaise);
  const subject = `Advance paid: ${data.dealTitle}`;
  const text = `The advance payment of ${amount} for "${data.dealTitle}" (${data.dealShortId}) was made. ${SETTLEMENT_TIMING_NOTE} The advance receipt is attached.`;
  const html = renderHtml(
    `<p>The advance payment of ${amount} for "${data.dealTitle}" (${data.dealShortId}) was made.</p>` +
      `<p>${SETTLEMENT_TIMING_NOTE}</p>` +
      `<p>The advance receipt is attached.</p>`,
  );
  return { subject, text, html };
}
