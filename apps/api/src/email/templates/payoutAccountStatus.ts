import { SETTLEMENT_TIMING_NOTE } from '@valueskins/shared';
import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { renderHtml } from './layout.js';

/** #16: Payout account status (SPEC 8) — sent to the creator when the linked
 * account becomes ACTIVE or NEEDS_CLARIFICATION. */
export function payoutAccountStatusTemplate(
  data: EmailTemplateDataMap['PAYOUT_ACCOUNT_STATUS'],
): EmailContent {
  const isActive = data.status === 'ACTIVE';
  const subject = isActive
    ? 'Your payout account is active'
    : 'Your payout account needs attention';
  const bodyLine = isActive
    ? `Your payout account is now active. You can apply to deals. ${SETTLEMENT_TIMING_NOTE}`
    : 'Your payout account needs clarification before it can be activated. Check your Razorpay onboarding for details.';
  const text = bodyLine;
  const html = renderHtml(`<p>${bodyLine}</p>`);
  return { subject, text, html };
}
