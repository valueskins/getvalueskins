import { formatInr } from '@valueskins/shared';
import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { escapeHtml, renderHtml } from './layout.js';

/** #12: Commission payment reminder (SPEC 8) — sent to the brand daily while CONFIRMED. */
export function commissionPaymentReminderTemplate(
  data: EmailTemplateDataMap['COMMISSION_PAYMENT_REMINDER'],
): EmailContent {
  const amount = formatInr(data.commissionTotalPaise);
  const subject = `Reminder: commission due for ${data.dealTitle}`;
  const text = `The commission of ${amount} for "${data.dealTitle}" (${data.dealShortId}) is still unpaid.`;
  const html = renderHtml(
    `<p>The commission of ${amount} for "${escapeHtml(data.dealTitle)}" (${escapeHtml(data.dealShortId)}) is still unpaid.</p>`,
  );
  return { subject, text, html };
}
