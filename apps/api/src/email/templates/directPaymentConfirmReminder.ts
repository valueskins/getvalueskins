import { CHECK_YOUR_UPI_APP, formatInr } from '@valueskins/shared';
import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #20: Confirm payment reminder (SPEC 8) - sent to the creator while a recorded payment waits for them. */
export function directPaymentConfirmReminderTemplate(
  data: EmailTemplateDataMap['DIRECT_PAYMENT_CONFIRM_REMINDER'],
): EmailContent {
  const stage = data.stage === 'ADVANCE' ? 'advance' : 'final';
  const article = data.stage === 'ADVANCE' ? 'an' : 'a';
  const amount = formatInr(data.amountPaise);
  const subject = `Reminder: confirm your ${stage} payment for ${data.dealTitle}`;
  const text = `The brand recorded ${article} ${stage} payment of ${amount} for "${data.dealTitle}" (${data.dealShortId}), and it is waiting for you. ${CHECK_YOUR_UPI_APP} If it did not arrive, say so on the deal page. The deal moves on only when you confirm it.`;
  const html = renderHtml(
    `<p>The brand recorded ${article} ${stage} payment of ${amount} for "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}), and it is waiting for you.</p>` +
      `<p>${CHECK_YOUR_UPI_APP} If it did not arrive, say so on the deal page. The deal moves on only when you confirm it.</p>`,
  );
  return { subject, text, html };
}
