import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #7: Changes requested (SPEC 8) - sent to the creator, includes the feedback text. */
export function changesRequestedTemplate(
  data: EmailTemplateDataMap['CHANGES_REQUESTED'],
): EmailContent {
  const subject = `Changes requested: ${data.dealTitle}`;
  const text = `The brand requested changes for "${data.dealTitle}" (${data.dealShortId}):\n\n${data.feedback}`;
  const html = renderHtml(
    `<p>The brand requested changes for "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}):</p>` +
      `<p>${escapeHtml(data.feedback)}</p>`,
  );
  return { subject, text, html };
}
