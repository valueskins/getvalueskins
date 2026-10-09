import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #13: Content overdue (SPEC 8) — sent to both parties daily while content is overdue. */
export function contentOverdueTemplate(
  data: EmailTemplateDataMap['CONTENT_OVERDUE'],
): EmailContent {
  const subject = `Content overdue: ${data.dealTitle}`;
  const text = `Content for "${data.dealTitle}" (${data.dealShortId}) is overdue. The upload deadline was ${data.contentUploadDeadline}.`;
  const html = renderHtml(
    `<p>Content for "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) is overdue. The upload deadline was ${escapeHtml(data.contentUploadDeadline)}.</p>`,
  );
  return { subject, text, html };
}
