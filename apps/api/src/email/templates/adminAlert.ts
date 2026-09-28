import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { renderHtml } from './layout.js';

/** A1: Admin alert (SPEC 8) — sent to the admin on webhook processing errors
 * or failed transfers. */
export function adminAlertTemplate(data: EmailTemplateDataMap['ADMIN_ALERT']): EmailContent {
  const subject = `Admin alert: ${data.subjectLine}`;
  const text = `${data.subjectLine}\n\n${data.details}`;
  const html = renderHtml(`<p><strong>${data.subjectLine}</strong></p><p>${data.details}</p>`);
  return { subject, text, html };
}
