import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** Launch notice to brands (SPEC 8): posting deals is open. Sent once per brand by `notify:launch`. */
export function launchBrandsTemplate(data: EmailTemplateDataMap['LAUNCH_BRANDS']): EmailContent {
  const subject = 'Posting deals is open';
  const text = `You can now post deals on ValueSkins. Sign in to publish your first deal: ${data.appUrl}\n\nCreators apply to your deal. You choose one, pay the ValueSkins fee, and pay the creator directly by UPI.`;
  const html = renderHtml(
    `<p>You can now post deals on ValueSkins.</p>` +
      `<p><a href="${escapeHtml(data.appUrl)}">Sign in to publish your first deal</a></p>` +
      `<p>Creators apply to your deal. You choose one, pay the ValueSkins fee, and pay the creator directly by UPI.</p>`,
  );
  return { subject, text, html };
}
