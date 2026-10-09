import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #15: Dispute raised (SPEC 8) — sent to the admin, CC'd to both parties. */
export function disputeRaisedTemplate(data: EmailTemplateDataMap['DISPUTE_RAISED']): EmailContent {
  const subject = `Dispute raised: ${data.dealTitle}`;
  const text = `${data.raisedByUsername} raised a dispute on "${data.dealTitle}" (${data.dealShortId}).\n\nSubject: ${data.disputeSubject}\n\n${data.disputeDescription}`;
  const html = renderHtml(
    `<p>${escapeHtml(data.raisedByUsername)} raised a dispute on "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}).</p>` +
      `<p>Subject: ${escapeHtml(data.disputeSubject)}</p>` +
      `<p>${escapeHtml(data.disputeDescription)}</p>`,
  );
  return { subject, text, html };
}
