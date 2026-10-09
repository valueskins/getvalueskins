import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { payments, users } from '../db/schema/index.js';
import type { Deal, AfterCommitTask } from '../deals/stateMachine.js';
import { send } from '../email/send.js';
import type { Env } from '../env/index.js';

type PaymentRow = typeof payments.$inferSelect;

async function emailOf(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.email ?? null;
}

/**
 * Emails 4, 5 and 9 (SPEC 8), one task per recipient so one failure stops nothing. No
 * attachments yet: invoices and receipts arrive with the documents work (SPEC 7.4).
 */
export function captureEmailTasks(env: Env, payment: PaymentRow): AfterCommitTask[] {
  const base = (deal: Deal) => ({ dealShortId: deal.shortId, dealTitle: deal.title ?? '' });
  const options = (deal: Deal, userId: string) => ({ dealId: deal.id, userId });

  const toBrand = async (deal: Deal) => {
    const to = await emailOf(deal.brandId);
    if (!to) return;
    if (payment.type === 'COMMISSION') {
      await send(
        'COMMISSION_PAID_BRAND',
        to,
        { ...base(deal), commissionTotalPaise: payment.amountPaise },
        env,
        options(deal, deal.brandId),
      );
    } else if (payment.type === 'ADVANCE') {
      await send(
        'ADVANCE_PAID',
        to,
        { ...base(deal), advancePaise: payment.amountPaise },
        env,
        options(deal, deal.brandId),
      );
    } else {
      await send(
        'FINAL_PAYMENT_DONE',
        to,
        { ...base(deal), finalPaise: payment.amountPaise },
        env,
        options(deal, deal.brandId),
      );
    }
  };

  const toCreator = async (deal: Deal) => {
    if (!deal.creatorId) return;
    const to = await emailOf(deal.creatorId);
    if (!to) return;
    if (payment.type === 'COMMISSION') {
      await send('COMMISSION_PAID_CREATOR', to, base(deal), env, options(deal, deal.creatorId));
    } else if (payment.type === 'ADVANCE') {
      await send(
        'ADVANCE_PAID',
        to,
        { ...base(deal), advancePaise: payment.amountPaise },
        env,
        options(deal, deal.creatorId),
      );
    } else {
      await send(
        'FINAL_PAYMENT_DONE',
        to,
        { ...base(deal), finalPaise: payment.amountPaise },
        env,
        options(deal, deal.creatorId),
      );
    }
  };

  return [toBrand, toCreator];
}
