import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #2: New application (SPEC 8) — sent to the brand when a creator applies. */
export function newApplicationTemplate(
  data: EmailTemplateDataMap['NEW_APPLICATION'],
): EmailContent {
  const subject = `New application: ${data.dealTitle}`;
  const text = `${data.creatorUsername} applied to your deal "${data.dealTitle}" (${data.dealShortId}).`;
  const html = renderHtml(
    `<p>${escapeHtml(data.creatorUsername)} applied to your deal "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}).</p>`,
  );
  return { subject, text, html };
}
