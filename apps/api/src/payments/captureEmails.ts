import {
  renderAdp,
  renderInvoiceForPayment,
  type RenderedDocument,
} from '../documents/documents.service.js';
import type { AfterCommitTask, Deal } from '../deals/stateMachine.js';
import { payments } from '../db/schema/index.js';
import { emailOf } from '../email/recipients.js';
import { send } from '../email/send.js';
import { logger } from '../logging/logger.js';
import type { PaymentsDeps } from './types.js';

type PaymentRow = typeof payments.$inferSelect;

/** A PDF that cannot be rendered must not stop its email: the document stays downloadable. */
async function attachmentOrNone(
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
    return [];
  }
}

/**
 * Emails 4, 5, 9 and 10 (SPEC 8), one task per recipient so one failure stops nothing, run
 * after the capture committed. The invoice or receipt is rendered from its stored snapshot
 * and attached (email 4: to the brand only). On the final payment, email 10 follows email 9
 * to both parties with the deal report attached.
 */
export function captureEmailTasks(deps: PaymentsDeps, payment: PaymentRow): AfterCommitTask[] {
  const { env } = deps;
  const base = (deal: Deal) => ({ dealShortId: deal.shortId, dealTitle: deal.title ?? '' });
  const options = (deal: Deal, userId: string) => ({ dealId: deal.id, userId });
  const invoice = () => attachmentOrNone('invoice', () => renderInvoiceForPayment(payment.id));

  const toBrand = async (deal: Deal) => {
    const to = await emailOf(deal.brandId);
    if (!to) return;
    const attachments = await invoice();
    const sendOptions = { ...options(deal, deal.brandId), attachments };
    if (payment.type === 'COMMISSION') {
      await send(
        'COMMISSION_PAID_BRAND',
        to,
        { ...base(deal), commissionTotalPaise: payment.amountPaise },
        env,
        sendOptions,
      );
    } else if (payment.type === 'ADVANCE') {
      await send(
        'ADVANCE_PAID',
        to,
        { ...base(deal), advancePaise: payment.amountPaise },
        env,
        sendOptions,
      );
    } else {
      await send(
        'FINAL_PAYMENT_DONE',
        to,
        { ...base(deal), finalPaise: payment.amountPaise },
        env,
        sendOptions,
      );
    }
  };

  const toCreator = async (deal: Deal) => {
    if (!deal.creatorId) return;
    const to = await emailOf(deal.creatorId);
    if (!to) return;
    if (payment.type === 'COMMISSION') {
      // A notice only: the tax invoice is the brand's document.
      await send('COMMISSION_PAID_CREATOR', to, base(deal), env, options(deal, deal.creatorId));
      return;
    }
    const sendOptions = { ...options(deal, deal.creatorId), attachments: await invoice() };
    if (payment.type === 'ADVANCE') {
      await send(
        'ADVANCE_PAID',
        to,
        { ...base(deal), advancePaise: payment.amountPaise },
        env,
        sendOptions,
      );
    } else {
      await send(
        'FINAL_PAYMENT_DONE',
        to,
        { ...base(deal), finalPaise: payment.amountPaise },
        env,
        sendOptions,
      );
    }
  };

  const tasks: AfterCommitTask[] = [toBrand, toCreator];
  if (payment.type !== 'FINAL') return tasks;

  // Email 10: the deal report, rendered once for both parties.
  let report: Promise<Array<{ filename: string; content: Buffer }>> | null = null;
  const reportFor = (deal: Deal) => {
    report ??= attachmentOrNone('deal report', () => renderAdp(deal.id, deps.now()));
    return report;
  };
  const reportTo =
    (recipient: (deal: Deal) => string | null): AfterCommitTask =>
    async (deal) => {
      const userId = recipient(deal);
      if (!userId) return;
      const to = await emailOf(userId);
      if (!to) return;
      await send('DEAL_REPORT_READY', to, base(deal), env, {
        ...options(deal, userId),
        attachments: await reportFor(deal),
      });
    };
  return [...tasks, reportTo((deal) => deal.brandId), reportTo((deal) => deal.creatorId)];
}
