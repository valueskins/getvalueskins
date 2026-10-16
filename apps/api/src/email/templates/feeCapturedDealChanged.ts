import { feeCapturedDealChangedMessage, formatInr } from '@valueskins/shared';
import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/**
 * #21: Fee received on a deal that had changed (SPEC 8) - to the brand, when the fee was captured
 * after the deal had moved on (for example it was cancelled while Checkout was open). The payment is
 * kept, the deal is not changed, and ValueSkins refunds it by hand.
 */
export function feeCapturedDealChangedTemplate(
  data: EmailTemplateDataMap['FEE_CAPTURED_DEAL_CHANGED'],
): EmailContent {
  const subject = `We will refund your payment: ${data.dealTitle}`;
  const lead = feeCapturedDealChangedMessage(data.amountPaise);
  const detail = `The deal "${data.dealTitle}" (${data.dealShortId}) had changed before the payment of ${formatInr(data.amountPaise)} reached us, so it was not used for the deal. You do not need to do anything.`;
  const text = `${lead}\n\n${detail}`;
  const html = renderHtml(`<p>${escapeHtml(lead)}</p><p>${escapeHtml(detail)}</p>`);
  return { subject, text, html };
}
