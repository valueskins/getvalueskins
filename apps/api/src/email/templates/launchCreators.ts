import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** Launch notice to creators (SPEC 8): deals are opening. Sent once per creator by `notify:launch`. */
export function launchCreatorsTemplate(
  data: EmailTemplateDataMap['LAUNCH_CREATORS'],
): EmailContent {
  const subject = 'Deals are opening';
  const text = `Brands are starting to post deals on ValueSkins. Sign in to see them and apply: ${data.appUrl}\n\nMake sure your UPI ID is saved in your settings. You need it to apply.`;
  const html = renderHtml(
    `<p>Brands are starting to post deals on ValueSkins.</p>` +
      `<p><a href="${escapeHtml(data.appUrl)}">Sign in to see the deals and apply</a></p>` +
      `<p>Make sure your UPI ID is saved in your settings. You need it to apply.</p>`,
  );
  return { subject, text, html };
}
