import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #1: Deal published (SPEC 8) - sent to the brand when the deal goes OPEN. */
export function dealPublishedTemplate(data: EmailTemplateDataMap['DEAL_PUBLISHED']): EmailContent {
  const subject = `Deal published: ${data.dealTitle}`;
  const text = `Your deal "${data.dealTitle}" (${data.dealShortId}) is now open for applications. Application deadline: ${data.applicationDeadline}.`;
  const html = renderHtml(
    `<p>Your deal "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) is now open for applications.</p>` +
      `<p>Application deadline: ${escapeHtml(data.applicationDeadline)}</p>`,
  );
  return { subject, text, html };
}
