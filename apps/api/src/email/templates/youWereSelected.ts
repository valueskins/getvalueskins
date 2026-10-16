import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #3: You were selected (SPEC 8) - sent to the creator when the brand confirms them. */
export function youWereSelectedTemplate(
  data: EmailTemplateDataMap['YOU_WERE_SELECTED'],
): EmailContent {
  const subject = `You were selected: ${data.dealTitle}`;
  const text = `${data.brandName} selected you for the deal "${data.dealTitle}" (${data.dealShortId}).`;
  const html = renderHtml(
    `<p>${escapeHtml(data.brandName)} selected you for the deal "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}).</p>`,
  );
  return { subject, text, html };
}
