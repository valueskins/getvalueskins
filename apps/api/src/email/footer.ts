import type { Env } from '../env/index.js';
import { escapeHtml } from './templates/layout.js';
import type { EmailContent } from './types.js';

/** The line at the end of every email (REPLACEMENT_PLAN 2.7). */
export function supportFooterText(env: Env): string {
  return `Questions? Write to ${env.SUPPORT_EMAIL}.`;
}

/**
 * Adds the support footer to the text and the HTML of an email. Idempotent: a stored email
 * that already ends with the footer (an admin resend) gets no second one.
 */
export function withSupportFooter(content: EmailContent, env: Env): EmailContent {
  const footer = supportFooterText(env);
  if (content.text.includes(footer)) return content;

  const footerHtml = `<p style="color:#555555;font-size:13px">${escapeHtml(footer)}</p>`;
  const closing = '</div>';
  const html = content.html.endsWith(closing)
    ? `${content.html.slice(0, -closing.length)}${footerHtml}${closing}`
    : `${content.html}${footerHtml}`;
  return { ...content, text: `${content.text}\n\n${footer}`, html };
}
