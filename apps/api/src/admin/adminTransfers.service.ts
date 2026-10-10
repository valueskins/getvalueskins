import { TRANSFER_STATE_CONFLICT, type MarkManualInput } from '@valueskins/shared';
import { and, eq } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/types.js';
import { db } from '../db/client.js';
import { creatorPayoutAccounts, deals, payments, transfers } from '../db/schema/index.js';
import { notFound, parseId } from '../deals/access.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';
import { RazorpayApiError } from '../razorpay/errors.js';
import type { RazorpayTransfer } from '../razorpay/schemas.js';
import { mapRazorpayError } from '../payments/errors.js';
import { alertTransferFailed } from '../payments/markPaymentCaptured.js';
import {
  mapTransferStatus,
  secondsToDate,
  transferFailureReason,
} from '../payments/transfers.service.js';
import type { PaymentsDeps } from '../payments/types.js';
import { transferView } from './adminDeals.service.js';

type TransferRow = typeof transfers.$inferSelect;

function stateConflict(): AppError {
  return new AppError('TRANSFER_STATE_CONFLICT', 409, TRANSFER_STATE_CONFLICT);
}

/** Razorpay's rejection of a transfer request, in words for the admin (their own rule text, never personal data). */
function transferError(error: unknown): unknown {
  if (error instanceof RazorpayApiError && error.isRejection) {
    const detail = (error.description ?? error.razorpayCode ?? 'no reason given').slice(0, 200);
    return new AppError('TRANSFER_REJECTED', 422, `Razorpay rejected the transfer: ${detail}`);
  }
  return mapRazorpayError(error);
}

/** A transfer that still counts: it has not failed or been reversed. */
function isLive(t: RazorpayTransfer): boolean {
  const status = mapTransferStatus(t.status);
  return status === 'PENDING' || status === 'PROCESSED';
}

/** The values of our row that come from a Razorpay transfer. */
function fromRazorpay(t: RazorpayTransfer) {
  const status = mapTransferStatus(t.status);
  return {
    razorpayTransferId: t.id,
    status,
    failureReason: status === 'FAILED' ? transferFailureReason(t) : null,
    processedAt: secondsToDate(t.processed_at),
    razorpayFeePaise: t.fees ?? null,
    razorpayTaxPaise: t.tax ?? null,
  };
}

export type RetryOutcome = 'CREATED' | 'SYNCED';

/**
 * POST /admin/transfers/:id/retry (SPEC 7.3, 12). Razorpay has no retry endpoint, so a retry
 * first asks Razorpay what it has for the payment: a pending or processed transfer to the
 * creator for this amount is adopted, nothing is created, so repeating the call (or two admins
 * at once, serialised by the row lock) never pays twice. Only when ours failed and none is live
 * is one new transfer created from the captured payment, and the row goes back to PENDING with
 * the new id so the transfer webhooks can move it forward again.
 */
export async function retryTransfer(
  deps: PaymentsDeps,
  rawId: unknown,
): Promise<{ transfer: ReturnType<typeof transferView>; outcome: RetryOutcome }> {
  const id = parseId(rawId);

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(transfers)
      .where(eq(transfers.id, id))
      .for('update')
      .limit(1);
    if (!row) throw notFound();
    if (row.status === 'PROCESSED' || row.status === 'REVERSED') throw stateConflict();

    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, row.paymentId))
      .limit(1);
    if (!payment?.razorpayPaymentId) throw new Error(`transfer ${row.id} has no captured payment`);
    const [account] = await tx
      .select()
      .from(creatorPayoutAccounts)
      .where(eq(creatorPayoutAccounts.userId, row.creatorId))
      .limit(1);

    let listed: RazorpayTransfer[];
    try {
      listed = (await deps.razorpay.fetchPaymentTransfers(payment.razorpayPaymentId)).items;
    } catch (error) {
      throw transferError(error);
    }
    const live = listed.find(
      (t) =>
        t.recipient === account?.razorpayAccountId && t.amount === row.amountPaise && isLive(t),
    );
    if (live) {
      const [synced] = await tx
        .update(transfers)
        .set(fromRazorpay(live))
        .where(eq(transfers.id, row.id))
        .returning();
      return { row: synced as TransferRow, outcome: 'SYNCED' as const, failedNow: false };
    }

    if (!account || account.status !== 'ACTIVE') {
      throw new AppError(
        'CREATOR_PAYOUT_NOT_ACTIVE',
        409,
        "The creator's payout account is not active. Fix it in Razorpay, or mark the transfer as paid manually.",
      );
    }

    let created: RazorpayTransfer | undefined;
    try {
      const response = await deps.razorpay.createPaymentTransfers(payment.razorpayPaymentId, {
        transfers: [
          {
            account: account.razorpayAccountId,
            amount: row.amountPaise,
            currency: 'INR',
            notes: { deal_id: row.dealId, type: row.type, retry: '1' },
            on_hold: false,
          },
        ],
      });
      created =
        response.items.find((t) => t.recipient === account.razorpayAccountId) ?? response.items[0];
    } catch (error) {
      throw transferError(error);
    }
    if (!created) throw new Error(`Razorpay returned no transfer for ${row.id}`);

    const values = fromRazorpay(created);
    const [updated] = await tx
      .update(transfers)
      // A new transfer is PENDING (rank 0), so the transfer.processed webhook can move the row on.
      .set(values)
      .where(eq(transfers.id, row.id))
      .returning();
    return {
      row: updated as TransferRow,
      outcome: 'CREATED' as const,
      failedNow: values.status === 'FAILED',
    };
  });

  if (result.failedNow) {
    const [deal] = await db.select().from(deals).where(eq(deals.id, result.row.dealId)).limit(1);
    if (deal) await alertTransferFailed(deps, deal, result.row);
  }
  logger.info(
    { transferId: result.row.id, dealId: result.row.dealId, outcome: result.outcome },
    'admin transfer retry',
  );
  return { transfer: transferView(result.row), outcome: result.outcome };
}

/**
 * POST /admin/transfers/:id/mark-manual (SPEC 12): the admin paid the creator outside Razorpay
 * Route. Allowed from FAILED or PENDING. The same reference again is a no-op; PROCESSED or
 * REVERSED any other way is a 409. A later webhook cannot undo it (the status only moves forward).
 */
export async function markTransferManual(
  admin: AuthenticatedUser,
  rawId: unknown,
  input: MarkManualInput,
  now: Date,
): Promise<ReturnType<typeof transferView>> {
  const id = parseId(rawId);

  const row = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(transfers)
      .where(eq(transfers.id, id))
      .for('update')
      .limit(1);
    if (!locked) throw notFound();

    if (locked.status === 'PROCESSED' && locked.manualReference === input.reference) return locked;
    if (locked.status !== 'FAILED' && locked.status !== 'PENDING') throw stateConflict();

    const [updated] = await tx
      .update(transfers)
      .set({
        status: 'PROCESSED',
        processedAt: now,
        failureReason: null,
        manualReference: input.reference,
        manualById: admin.id,
        manualAt: now,
      })
      .where(and(eq(transfers.id, id), eq(transfers.status, locked.status)))
      .returning();
    if (!updated) throw stateConflict();
    return updated;
  });
  return transferView(row);
}
