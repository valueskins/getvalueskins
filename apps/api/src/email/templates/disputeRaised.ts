import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { renderHtml } from './layout.js';

/** #15: Dispute raised (SPEC 8) — sent to the admin, CC'd to both parties. */
export function disputeRaisedTemplate(data: EmailTemplateDataMap['DISPUTE_RAISED']): EmailContent {
  const subject = `Dispute raised: ${data.dealTitle}`;
  const text = `${data.raisedByUsername} raised a dispute on "${data.dealTitle}" (${data.dealShortId}).\n\nSubject: ${data.disputeSubject}\n\n${data.disputeDescription}`;
  const html = renderHtml(
    `<p>${data.raisedByUsername} raised a dispute on "${data.dealTitle}" (${data.dealShortId}).</p>` +
      `<p>Subject: ${data.disputeSubject}</p>` +
      `<p>${data.disputeDescription}</p>`,
  );
  return { subject, text, html };
}
