import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #3b: Application not selected (SPEC 8) - sent to other applicants when the
 * brand confirms someone else. */
export function applicationNotSelectedTemplate(
  data: EmailTemplateDataMap['APPLICATION_NOT_SELECTED'],
): EmailContent {
  const subject = `Application update: ${data.dealTitle}`;
  const text = `The deal "${data.dealTitle}" (${data.dealShortId}) has selected another creator. You were not chosen this time.`;
  const html = renderHtml(
    `<p>The deal "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) has selected another creator. You were not chosen this time.</p>`,
  );
  return { subject, text, html };
}
