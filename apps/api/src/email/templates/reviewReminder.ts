import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #14: Review reminder (SPEC 8) — sent to the brand daily after 3 days in CONTENT_UPLOADED. */
export function reviewReminderTemplate(
  data: EmailTemplateDataMap['REVIEW_REMINDER'],
): EmailContent {
  const subject = `Reminder: review content for ${data.dealTitle}`;
  const text = `Content for "${data.dealTitle}" (${data.dealShortId}) has been waiting for your review for ${data.daysInReview} days.`;
  const html = renderHtml(
    `<p>Content for "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) has been waiting for your review for ${data.daysInReview} days.</p>`,
  );
  return { subject, text, html };
}
