import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #10: Deal record ready (SPEC 8) - sent to both parties when the deal
 * COMPLETES; the deal record (ADP) is attached by the caller via send()'s attachments option. */
export function dealReportReadyTemplate(
  data: EmailTemplateDataMap['DEAL_REPORT_READY'],
): EmailContent {
  const subject = `Deal record ready: ${data.dealTitle}`;
  const text = `The deal "${data.dealTitle}" (${data.dealShortId}) is complete. The deal record is attached.`;
  const html = renderHtml(
    `<p>The deal "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) is complete. The deal record is attached.</p>`,
  );
  return { subject, text, html };
}
