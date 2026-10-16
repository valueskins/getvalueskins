import { renderInvoiceForPayment, type RenderedDocument } from '../documents/documents.service.js';
import type { AfterCommitTask, Deal } from '../deals/stateMachine.js';
import { payments } from '../db/schema/index.js';
import { emailOf } from '../email/recipients.js';
import { send } from '../email/send.js';
import { logger } from '../logging/logger.js';
import { captureError } from '../observability/sentry.js';
import type { PaymentsDeps } from './types.js';

type PaymentRow = typeof payments.$inferSelect;

/** A PDF that cannot be rendered must not stop its email: the document stays downloadable. */
export async function attachmentOrNone(
  what: string,
  render: () => Promise<RenderedDocument | null>,
): Promise<Array<{ filename: string; content: Buffer }>> {
  try {
    const document = await render();
    return document ? [{ filename: document.filename, content: document.content }] : [];
  } catch (error) {
    logger.error(
      { what, error: error instanceof Error ? error.message : 'unknown' },
      'could not render an email attachment',
    );
    captureError(error, 'email attachment');
    return [];
  }
}

/**
 * Email 4 (SPEC 8), one task per recipient so one failure stops nothing, run after the capture
 * committed: the tax invoice or invoice is rendered from its stored snapshot and attached for the
 * brand; the creator gets a notice only. The advance and final emails (5, 9, 10) are sent when
 * the creator confirms a direct payment (directPayments/directPaymentEmails.ts).
 */
export function captureEmailTasks(_deps: PaymentsDeps, payment: PaymentRow): AfterCommitTask[] {
  const base = (deal: Deal) => ({ dealShortId: deal.shortId, dealTitle: deal.title ?? '' });
  const options = (deal: Deal, userId: string) => ({ dealId: deal.id, userId });

  const toBrand = async (deal: Deal) => {
    const to = await emailOf(deal.brandId);
    if (!to) return;
    const attachments = await attachmentOrNone('invoice', () =>
      renderInvoiceForPayment(payment.id),
    );
    await send(
      'COMMISSION_PAID_BRAND',
      to,
      { ...base(deal), commissionTotalPaise: payment.amountPaise },
      env(_deps),
      { ...options(deal, deal.brandId), attachments },
    );
  };

  const toCreator = async (deal: Deal) => {
    if (!deal.creatorId) return;
    const to = await emailOf(deal.creatorId);
    if (!to) return;
    // A notice only: the tax invoice is the brand's document.
    await send(
      'COMMISSION_PAID_CREATOR',
      to,
      base(deal),
      env(_deps),
      options(deal, deal.creatorId),
    );
  };

  return [toBrand, toCreator];
}

const env = (deps: PaymentsDeps) => deps.env;
