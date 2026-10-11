import { formatInr } from '@valueskins/shared';
import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #18: Payment not received (SPEC 8) - sent to both parties when the creator says the money
 * did not arrive. The brand can then record the payment again. */
export function directPaymentNotReceivedTemplate(
  data: EmailTemplateDataMap['DIRECT_PAYMENT_NOT_RECEIVED'],
): EmailContent {
  const stage = data.stage === 'ADVANCE' ? 'advance' : 'final';
  const amount = formatInr(data.amountPaise);
  const subject = `Payment not received: ${data.dealTitle}`;
  const text = `The creator says the ${stage} payment of ${amount} for "${data.dealTitle}" (${data.dealShortId}) did not arrive. UPI reference recorded: ${data.reference}. Reason: ${data.reason}. The deal has not moved. The brand can check the payment and record it again.`;
  const html = renderHtml(
    `<p>The creator says the ${stage} payment of ${amount} for "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) did not arrive.</p>` +
      `<p>UPI reference recorded: ${escapeHtml(data.reference)}</p>` +
      `<p>Reason: ${escapeHtml(data.reason)}</p>` +
      `<p>The deal has not moved. The brand can check the payment and record it again.</p>`,
  );
  return { subject, text, html };
}
