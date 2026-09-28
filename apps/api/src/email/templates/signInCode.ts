import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { renderHtml } from './layout.js';

/** V0_LAUNCH 2.1 / SPEC 6.5: sign-in code for email-code login. */
export function signInCodeTemplate(data: EmailTemplateDataMap['SIGN_IN_CODE']): EmailContent {
  const subject = 'Your sign-in code';
  const text = `Your ValueSkins sign-in code is ${data.code}. It expires in ${data.expiresInMinutes} minutes. If you did not request this, ignore this email.`;
  const html = renderHtml(
    `<p>Your ValueSkins sign-in code is:</p>` +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:4px">${data.code}</p>` +
      `<p>It expires in ${data.expiresInMinutes} minutes. If you did not request this, ignore this email.</p>`,
  );
  return { subject, text, html };
}
