import { formatInr } from '@valueskins/shared';
import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #19: Payment due reminder (SPEC 8) - sent to the brand while the advance or final has no payment recorded. */
export function directPaymentDueReminderTemplate(
  data: EmailTemplateDataMap['DIRECT_PAYMENT_DUE_REMINDER'],
): EmailContent {
  const stage = data.stage === 'ADVANCE' ? 'advance' : 'final';
  const amount = formatInr(data.amountPaise);
  const subject = `Reminder: ${stage} payment due for ${data.dealTitle}`;
  const text = `The ${stage} of ${amount} for "${data.dealTitle}" (${data.dealShortId}) is due. Pay the creator by UPI, then record the payment on the deal page. The deal moves on when the creator confirms it arrived.`;
  const html = renderHtml(
    `<p>The ${stage} of ${amount} for "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) is due.</p>` +
      '<p>Pay the creator by UPI, then record the payment on the deal page. The deal moves on when the creator confirms it arrived.</p>',
  );
  return { subject, text, html };
}
