import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #6: Content uploaded (SPEC 8) - sent to the brand when the creator uploads. */
export function contentUploadedTemplate(
  data: EmailTemplateDataMap['CONTENT_UPLOADED'],
): EmailContent {
  const subject = `Content uploaded: ${data.dealTitle}`;
  const text = `Content was uploaded for "${data.dealTitle}" (${data.dealShortId}). Link: ${data.contentLink}`;
  const html = renderHtml(
    `<p>Content was uploaded for "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}).</p>` +
      `<p><a href="${escapeHtml(data.contentLink)}" rel="noopener noreferrer">${escapeHtml(data.contentLink)}</a></p>`,
  );
  return { subject, text, html };
}
