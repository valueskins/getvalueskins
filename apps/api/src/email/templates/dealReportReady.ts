import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #10: Deal report ready (SPEC 8) — sent to both parties when the deal
 * COMPLETES; the ADP is attached by the caller via send()'s attachments option. */
export function dealReportReadyTemplate(
  data: EmailTemplateDataMap['DEAL_REPORT_READY'],
): EmailContent {
  const subject = `Deal report ready: ${data.dealTitle}`;
  const text = `The deal "${data.dealTitle}" (${data.dealShortId}) is complete. The deal report is attached.`;
  const html = renderHtml(
    `<p>The deal "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) is complete. The deal report is attached.</p>`,
  );
  return { subject, text, html };
}
