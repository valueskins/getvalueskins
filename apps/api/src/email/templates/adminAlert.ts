import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** A1: Admin alert (SPEC 8) - sent to the admin on webhook processing errors and when a
 * creator says a direct payment did not arrive. */
export function adminAlertTemplate(data: EmailTemplateDataMap['ADMIN_ALERT']): EmailContent {
  const subject = `Admin alert: ${data.subjectLine}`;
  const text = `${data.subjectLine}\n\n${data.details}`;
  const html = renderHtml(
    `<p><strong>${escapeHtml(data.subjectLine)}</strong></p><p>${escapeHtml(data.details)}</p>`,
  );
  return { subject, text, html };
}
