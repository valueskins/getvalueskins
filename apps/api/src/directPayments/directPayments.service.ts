import {
  APPLICANT_HAS_NO_UPI,
  CREATOR_HAS_NO_UPI,
  CREATOR_NOT_AGREED_TO_SHARE_UPI,
  DIRECT_PAYMENT_ALREADY_RECORDED,
  DIRECT_PAYMENT_NOT_PENDING,
  buildUpiPay,
  dueStageFor,
  upiPayUri,
  type DealStatus,
  type DirectPaymentInfo,
  type DirectPaymentNotReceivedInput,
  type DirectPaymentRecordInput,
  type DirectPaymentStage,
  type DirectPaymentView,
} from '@valueskins/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/types.js';
import type { ApiContext } from '../context.js';
import { emitDealUpdated } from '../realtime/events.js';
import { db } from '../db/client.js';
import { isUniqueViolation } from '../db/pgErrors.js';
import { deals, directPayments } from '../db/schema/index.js';
import { loadConfirmedCreatorDeal, loadOwnedDeal, notFound, parseId } from '../deals/access.js';
import { recordPaymentEvent } from '../deals/dealEvents.js';
import { payoutStatusOfSaved, readPayoutForPayment } from '../deals/payoutDetails.js';
import { transitionDeal, type Deal } from '../deals/stateMachine.js';
import { AppError } from '../errors/AppError.js';
import { issuePaymentRecord } from '../invoices/issueInvoice.js';
import { companyFromEnv } from '../invoices/snapshot.js';
import {
  confirmedEmailTasks,
  notReceivedEmailTasks,
  recordedEmailTask,
} from './directPaymentEmails.js';
import { listDirectPaymentRows, toDirectPaymentView, type DirectPaymentRow } from './view.js';

interface DueStage {
  stage: DirectPaymentStage;
  from: DealStatus;
  to: DealStatus;
}

/** Where the deal goes when the creator confirms the stage that is due (SPEC 5.2). */
const NEXT_STATUS: Partial<Record<DealStatus, DealStatus>> = {
  COMMISSION_PAID: 'ADVANCE_PAID',
  APPROVED: 'COMPLETED',
};

/** The stage that is due in a status: the advance after the fee, the final after approval. */
function dueOf(status: DealStatus): DueStage | undefined {
  const stage = dueStageFor(status);
  const to = NEXT_STATUS[status];
  return stage && to ? { stage, from: status, to } : undefined;
}

function amountOf(deal: Deal, stage: DirectPaymentStage): number {
  const amount = stage === 'ADVANCE' ? deal.advancePaise : deal.finalPaise;
  if (amount === null || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`deal ${deal.id} has no frozen ${stage} amount`);
  }
  return amount;
}

const blocked = (reason: NonNullable<DirectPaymentInfo['blocked']>): DirectPaymentInfo => ({
  blocked: reason,
  stage: null,
  amountPaise: null,
  payee: null,
  upi: null,
  upiUri: null,
  record: null,
});

/**
 * GET /deals/:id/direct-payment, for the deal's brand. The creator's full UPI ID and name leave
 * the API here and nowhere else, only while a stage is due and the creator consented
 * (REPLACEMENT_PLAN 2.1). The amount is the deal's frozen advance or final.
 */
export async function getDirectPaymentInfo(
  user: AuthenticatedUser,
  rawDealId: unknown,
): Promise<DirectPaymentInfo> {
  const deal = await loadOwnedDeal(rawDealId, user.id);
  if (!deal.creatorId) return blocked('no_creator');
  const due = dueOf(deal.status);
  if (!due) return blocked('not_due');

  const payout = await readPayoutForPayment(deal.creatorId);
  if (!payout.vpa || !payout.name) return blocked('creator_has_no_upi');
  if (!payout.consentAt) return blocked('no_consent');

  const amountPaise = amountOf(deal, due.stage);
  const upi = buildUpiPay({
    vpa: payout.vpa,
    name: payout.name,
    amountPaise,
    dealShortId: deal.shortId,
    stage: due.stage,
  });
  const live = (await listDirectPaymentRows(deal.id)).find(
    (r) => r.stage === due.stage && r.disputedAt === null,
  );
  return {
    blocked: null,
    stage: due.stage,
    amountPaise,
    payee: { vpa: payout.vpa, name: payout.name },
    upi,
    upiUri: upiPayUri(upi),
    record: live ? toDirectPaymentView(live) : null,
  };
}

/**
 * POST /deals/:id/direct-payment: the brand records that it paid the stage that is due, with the
 * UPI reference. The amount is the frozen one and the status never changes: only the creator's
 * confirmation moves the deal (REPLACEMENT_PLAN 2.1). Email 17 goes to the creator.
 */
export async function recordDirectPayment(
  ctx: ApiContext,
  user: AuthenticatedUser,
  rawDealId: unknown,
  input: DirectPaymentRecordInput,
): Promise<DirectPaymentView> {
  const loaded = await loadOwnedDeal(rawDealId, user.id);
  const due = dueOf(loaded.status);
  if (!due || due.stage !== input.stage) {
    throw new AppError(
      'WRONG_DEAL_STATUS',
      409,
      `The ${input.stage.toLowerCase()} payment is not due yet`,
    );
  }
  if (!loaded.creatorId) throw new AppError('CREATOR_PAYOUT_NOT_SET', 409, APPLICANT_HAS_NO_UPI);

  let row: DirectPaymentRow;
  try {
    row = await db.transaction(async (tx) => {
      // A share lock on the deal row: an admin cancel waits for this insert, or this one sees it.
      const [locked] = await tx
        .select()
        .from(deals)
        .where(eq(deals.id, loaded.id))
        .for('share')
        .limit(1);
      if (!locked || locked.status !== due.from) {
        throw new AppError(
          'WRONG_DEAL_STATUS',
          409,
          'The deal is no longer waiting for this payment',
        );
      }
      const payout = await readPayoutForPayment(locked.creatorId as string, tx);
      const payoutStatus = payoutStatusOfSaved(payout);
      const payeeVpa = payout.vpa;
      if (payoutStatus !== 'SET' || !payeeVpa) {
        throw new AppError(
          'CREATOR_PAYOUT_NOT_SET',
          409,
          payoutStatus === 'NO_CONSENT' ? CREATOR_NOT_AGREED_TO_SHARE_UPI : CREATOR_HAS_NO_UPI,
        );
      }
      const [inserted] = await tx
        .insert(directPayments)
        .values({
          dealId: locked.id,
          stage: due.stage,
          amountPaise: amountOf(locked, due.stage),
          reference: input.reference,
          paidToVpa: payeeVpa,
          note: input.note ? input.note : null,
          recordedBy: user.id,
          recordedAt: ctx.now(),
        })
        .returning();
      if (!inserted) throw new Error('direct payment insert returned no row');
      // The activity entry is written with the record, in the same transaction.
      await recordPaymentEvent(tx, {
        dealId: locked.id,
        status: locked.status,
        kind: 'PAYMENT_RECORDED',
        directPaymentId: inserted.id,
        stage: inserted.stage,
        actorId: user.id,
        note: inserted.note,
      });
      return inserted;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('DIRECT_PAYMENT_ALREADY_RECORDED', 409, DIRECT_PAYMENT_ALREADY_RECORDED);
    }
    throw error;
  }

  // After the commit, and never failing the request (SPEC 8). The deal's status did not change, but
  // the record is new, so both sides' open pages refetch (SPEC 10).
  emitDealUpdated(loaded);
  try {
    await recordedEmailTask(ctx.env, row)(loaded);
  } catch {
    // The record is saved; send() already logs its own failures.
  }
  return toDirectPaymentView(row);
}

async function loadRecordForCreator(
  rawId: unknown,
  user: AuthenticatedUser,
): Promise<{ row: DirectPaymentRow; deal: Deal }> {
  const [row] = await db
    .select()
    .from(directPayments)
    .where(eq(directPayments.id, parseId(rawId)))
    .limit(1);
  if (!row) throw notFound();
  const deal = await loadConfirmedCreatorDeal(row.dealId, user.id);
  return { row, deal };
}

/**
 * POST /direct-payments/:id/confirm: the confirmed creator says the money arrived. One
 * transaction: the record is confirmed, the payment record document is issued and the deal moves
 * (COMMISSION_PAID to ADVANCE_PAID, APPROVED to COMPLETED), all through transitionDeal. Two
 * confirms at once: one wins, the other is a 409.
 */
export async function confirmDirectPayment(
  ctx: ApiContext,
  user: AuthenticatedUser,
  rawId: unknown,
): Promise<{ directPayment: DirectPaymentView; deal: Deal }> {
  const { row } = await loadRecordForCreator(rawId, user);
  const due = dueOf(row.stage === 'ADVANCE' ? 'COMMISSION_PAID' : 'APPROVED') as DueStage;
  const now = ctx.now();
  let confirmed: DirectPaymentRow | undefined;

  const moved = await transitionDeal({
    dealId: row.dealId,
    from: due.from,
    to: due.to,
    actor: { role: 'CREATOR', id: user.id },
    patch: row.stage === 'ADVANCE' ? { advancePaidAt: now } : { completedAt: now },
    // Ids only: the UPI ID and the reference never go into the event metadata.
    metadata: { directPaymentId: row.id, stage: row.stage },
    within: async (tx, updatedDeal) => {
      const [updated] = await tx
        .update(directPayments)
        .set({ confirmedBy: user.id, confirmedAt: now })
        .where(
          and(
            eq(directPayments.id, row.id),
            isNull(directPayments.confirmedAt),
            isNull(directPayments.disputedAt),
          ),
        )
        .returning();
      if (!updated)
        throw new AppError('DIRECT_PAYMENT_NOT_PENDING', 409, DIRECT_PAYMENT_NOT_PENDING);
      confirmed = updated;
      await issuePaymentRecord(tx, {
        deal: updatedDeal,
        directPayment: {
          id: updated.id,
          stage: updated.stage,
          amountPaise: updated.amountPaise,
          reference: updated.reference,
          note: updated.note,
          paidToVpa: updated.paidToVpa,
          recordedAt: updated.recordedAt,
        },
        now,
        company: companyFromEnv(ctx.env),
      });
    },
    afterCommit: confirmedEmailTasks(ctx.env, ctx.now, row),
  });
  if (!confirmed) throw new Error('confirm finished without a confirmed record');
  return { directPayment: toDirectPaymentView(confirmed), deal: moved };
}

/**
 * POST /direct-payments/:id/not-received: the confirmed creator says the money did not arrive.
 * The record is marked disputed (never edited or deleted), the deal does not move, both parties
 * are emailed and the admin gets alert A1. The brand can then record the payment again. This is
 * an alert, not a row in `disputes` (REPLACEMENT_PLAN 2.7).
 */
export async function markNotReceived(
  ctx: ApiContext,
  user: AuthenticatedUser,
  rawId: unknown,
  input: DirectPaymentNotReceivedInput,
): Promise<{ directPayment: DirectPaymentView; deal: Deal }> {
  const { row } = await loadRecordForCreator(rawId, user);
  const { updated, deal } = await db.transaction(async (tx) => {
    // The deal row is read under a share lock, so the event names the status it really is in.
    const [locked] = await tx
      .select()
      .from(deals)
      .where(eq(deals.id, row.dealId))
      .for('share')
      .limit(1);
    if (!locked) throw notFound();
    const [changed] = await tx
      .update(directPayments)
      .set({ disputedAt: ctx.now(), disputeReason: input.reason })
      .where(
        and(
          eq(directPayments.id, row.id),
          isNull(directPayments.confirmedAt),
          isNull(directPayments.disputedAt),
        ),
      )
      .returning();
    if (!changed) throw new AppError('DIRECT_PAYMENT_NOT_PENDING', 409, DIRECT_PAYMENT_NOT_PENDING);
    await recordPaymentEvent(tx, {
      dealId: locked.id,
      status: locked.status,
      kind: 'PAYMENT_NOT_RECEIVED',
      directPaymentId: changed.id,
      stage: changed.stage,
      actorId: user.id,
      note: input.reason,
    });
    return { updated: changed, deal: locked };
  });

  // The status is unchanged, but the record is now marked not received: refetch (SPEC 10).
  emitDealUpdated(deal);
  for (const task of notReceivedEmailTasks(ctx.env, updated, input.reason)) {
    try {
      await task(deal);
    } catch {
      // The record is saved; a failed email never fails the request.
    }
  }
  return { directPayment: toDirectPaymentView(updated), deal };
}
