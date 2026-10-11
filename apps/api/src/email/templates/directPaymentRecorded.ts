import { CHECK_YOUR_UPI_APP, formatInr } from '@valueskins/shared';
import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #17: Payment recorded (SPEC 8) - sent to the creator when the brand records a UPI payment.
 * It never names the UPI ID: the creator knows their own, and emails are kept on the deal. */
export function directPaymentRecordedTemplate(
  data: EmailTemplateDataMap['DIRECT_PAYMENT_RECORDED'],
): EmailContent {
  const stage = data.stage === 'ADVANCE' ? 'advance' : 'final';
  const amount = formatInr(data.amountPaise);
  const subject = `Confirm your ${stage} payment: ${data.dealTitle}`;
  const text = `The brand says it paid the ${stage} of ${amount} for "${data.dealTitle}" (${data.dealShortId}) by UPI. UPI reference: ${data.reference}. ${CHECK_YOUR_UPI_APP} The deal moves on only when you confirm it.`;
  const html = renderHtml(
    `<p>The brand says it paid the ${stage} of ${amount} for "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) by UPI.</p>` +
      `<p>UPI reference: ${escapeHtml(data.reference)}</p>` +
      `<p>${CHECK_YOUR_UPI_APP} The deal moves on only when you confirm it.</p>`,
  );
  return { subject, text, html };
}
