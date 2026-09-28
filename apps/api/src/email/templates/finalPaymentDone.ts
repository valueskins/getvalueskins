import { formatInr } from '@valueskins/shared';
import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { renderHtml } from './layout.js';

/** #9: Final payment done (SPEC 8) — sent to both parties; the final receipt
 * is attached by the caller via send()'s attachments option. */
export function finalPaymentDoneTemplate(
  data: EmailTemplateDataMap['FINAL_PAYMENT_DONE'],
): EmailContent {
  const amount = formatInr(data.finalPaise);
  const subject = `Final payment done: ${data.dealTitle}`;
  const text = `The final payment of ${amount} for "${data.dealTitle}" (${data.dealShortId}) was made. The final receipt is attached.`;
  const html = renderHtml(
    `<p>The final payment of ${amount} for "${data.dealTitle}" (${data.dealShortId}) was made.</p>` +
      `<p>The final receipt is attached.</p>`,
  );
  return { subject, text, html };
}
