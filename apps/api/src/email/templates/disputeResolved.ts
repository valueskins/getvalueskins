import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #15b: Dispute resolved (SPEC 8) - sent to both parties when an admin resolves it. */
export function disputeResolvedTemplate(
  data: EmailTemplateDataMap['DISPUTE_RESOLVED'],
): EmailContent {
  const subject = `Dispute resolved: ${data.dealTitle}`;
  const refundLine = data.refundReference ? `Refund reference: ${data.refundReference}` : null;
  const text = [
    `The dispute "${data.disputeSubject}" on "${data.dealTitle}" (${data.dealShortId}) has been resolved.`,
    `Resolution: ${data.resolution}`,
    ...(refundLine ? [refundLine] : []),
  ].join('\n\n');
  const html = renderHtml(
    `<p>The dispute "${escapeHtml(data.disputeSubject)}" on "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) has been resolved.</p>` +
      `<p>Resolution: ${escapeHtml(data.resolution)}</p>` +
      (refundLine ? `<p>${escapeHtml(refundLine)}</p>` : ''),
  );
  return { subject, text, html };
}
