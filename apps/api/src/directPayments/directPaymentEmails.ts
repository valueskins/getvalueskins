import type { DirectPaymentStage } from '@valueskins/shared';
import { attachmentOrNone } from '../payments/captureEmails.js';
import { renderAdp, renderRecordForDirectPayment } from '../documents/documents.service.js';
import type { AfterCommitTask, Deal } from '../deals/stateMachine.js';
import { emailOf } from '../email/recipients.js';
import { send } from '../email/send.js';
import type { Env } from '../env/index.js';
import { alertAdmin } from '../payments/alerts.js';

interface RecordFacts {
  id: string;
  stage: DirectPaymentStage;
  amountPaise: number;
  reference: string;
}

const base = (deal: Deal) => ({ dealShortId: deal.shortId, dealTitle: deal.title ?? '' });
const options = (deal: Deal, userId: string) => ({ dealId: deal.id, userId });

/** Email 17: the brand recorded a payment, to the creator. No UPI ID in it. */
export function recordedEmailTask(env: Env, record: RecordFacts): AfterCommitTask {
  return async (deal) => {
    if (!deal.creatorId) return;
    const to = await emailOf(deal.creatorId);
    if (!to) return;
    await send(
      'DIRECT_PAYMENT_RECORDED',
      to,
      {
        ...base(deal),
        stage: record.stage,
        amountPaise: record.amountPaise,
        reference: record.reference,
      },
      env,
      options(deal, deal.creatorId),
    );
  };
}

/**
 * Emails 5 or 9 to both parties once the creator confirmed, with the payment record attached,
 * and on the final also email 10 (the deal report) to both after it (SPEC 8).
 */
export function confirmedEmailTasks(
  env: Env,
  now: () => Date,
  record: RecordFacts,
): AfterCommitTask[] {
  const attach = () =>
    attachmentOrNone('payment record', () => renderRecordForDirectPayment(record.id));
  const to = async (deal: Deal, userId: string | null) => {
    if (!userId) return null;
    const address = await emailOf(userId);
    return address ? { address, userId } : null;
  };

  const confirmedTo =
    (pick: (deal: Deal) => string | null): AfterCommitTask =>
    async (deal) => {
      const recipient = await to(deal, pick(deal));
      if (!recipient) return;
      const attachments = await attach();
      const opts = { ...options(deal, recipient.userId), attachments };
      if (record.stage === 'ADVANCE') {
        await send(
          'ADVANCE_PAID',
          recipient.address,
          { ...base(deal), advancePaise: record.amountPaise },
          env,
          opts,
        );
      } else {
        await send(
          'FINAL_PAYMENT_DONE',
          recipient.address,
          { ...base(deal), finalPaise: record.amountPaise },
          env,
          opts,
        );
      }
    };

  const tasks: AfterCommitTask[] = [
    confirmedTo((deal) => deal.brandId),
    confirmedTo((deal) => deal.creatorId),
  ];
  if (record.stage !== 'FINAL') return tasks;

  let report: Promise<Array<{ filename: string; content: Buffer }>> | null = null;
  const reportFor = (deal: Deal) => {
    report ??= attachmentOrNone('deal report', () => renderAdp(deal.id, now()));
    return report;
  };
  const reportTo =
    (pick: (deal: Deal) => string | null): AfterCommitTask =>
    async (deal) => {
      const recipient = await to(deal, pick(deal));
      if (!recipient) return;
      await send('DEAL_REPORT_READY', recipient.address, base(deal), env, {
        ...options(deal, recipient.userId),
        attachments: await reportFor(deal),
      });
    };
  return [...tasks, reportTo((deal) => deal.brandId), reportTo((deal) => deal.creatorId)];
}

/** Email 18 to both parties, and alert A1 to the admin (REPLACEMENT_PLAN 2.1, 2.7). */
export function notReceivedEmailTasks(
  env: Env,
  record: RecordFacts,
  reason: string,
): AfterCommitTask[] {
  const toParty =
    (pick: (deal: Deal) => string | null): AfterCommitTask =>
    async (deal) => {
      const userId = pick(deal);
      if (!userId) return;
      const address = await emailOf(userId);
      if (!address) return;
      await send(
        'DIRECT_PAYMENT_NOT_RECEIVED',
        address,
        {
          ...base(deal),
          stage: record.stage,
          amountPaise: record.amountPaise,
          reference: record.reference,
          reason,
        },
        env,
        options(deal, userId),
      );
    };
  return [
    toParty((deal) => deal.brandId),
    toParty((deal) => deal.creatorId),
    async (deal) =>
      alertAdmin(
        env,
        'Creator says a direct payment did not arrive',
        `Deal ${deal.shortId}: the creator says the ${record.stage} payment (UPI reference ${record.reference}) did not arrive. Reason: ${reason}. The deal has not moved and the brand can record it again.`,
      ),
  ];
}
