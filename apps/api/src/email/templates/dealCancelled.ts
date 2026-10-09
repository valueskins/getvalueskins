import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #11: Deal cancelled (SPEC 8) — sent to the brand, and to the creator if confirmed. */
export function dealCancelledTemplate(data: EmailTemplateDataMap['DEAL_CANCELLED']): EmailContent {
  const commissionLine = data.commissionKept
    ? 'The commission already paid was kept.'
    : 'No commission was charged.';
  const subject = `Deal cancelled: ${data.dealTitle}`;
  const text = `The deal "${data.dealTitle}" (${data.dealShortId}) was cancelled. Reason: ${data.reason}. ${commissionLine}`;
  const html = renderHtml(
    `<p>The deal "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) was cancelled.</p>` +
      `<p>Reason: ${escapeHtml(data.reason)}</p>` +
      `<p>${commissionLine}</p>`,
  );
  return { subject, text, html };
}
