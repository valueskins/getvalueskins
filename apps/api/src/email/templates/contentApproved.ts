import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #8: Content approved (SPEC 8) — sent to the creator. */
export function contentApprovedTemplate(
  data: EmailTemplateDataMap['CONTENT_APPROVED'],
): EmailContent {
  const subject = `Content approved: ${data.dealTitle}`;
  const text = `Your content for "${data.dealTitle}" (${data.dealShortId}) was approved. Waiting for final payment.`;
  const html = renderHtml(
    `<p>Your content for "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) was approved. Waiting for final payment.</p>`,
  );
  return { subject, text, html };
}
