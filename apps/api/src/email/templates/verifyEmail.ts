import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { renderHtml } from './layout.js';

/** E0: Verify your email (SPEC 8) — sent when the email is entered or changed. */
export function verifyEmailTemplate(data: EmailTemplateDataMap['VERIFY_EMAIL']): EmailContent {
  const subject = 'Verify your email';
  const text = `Click this link to verify your email: ${data.verifyUrl}\n\nThis link is valid for 24 hours and can be used once.`;
  const html = renderHtml(
    `<p>Click the link below to verify your email.</p>` +
      `<p><a href="${data.verifyUrl}">${data.verifyUrl}</a></p>` +
      `<p>This link is valid for 24 hours and can be used once.</p>`,
  );
  return { subject, text, html };
}
