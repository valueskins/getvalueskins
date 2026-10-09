import type { TransferStatus } from '@valueskins/shared';
import type { RazorpayTransfer } from '../razorpay/schemas.js';

const MAX_REASON_LENGTH = 500;

/** Razorpay transfer status -> ours (created and pending are both PENDING). */
export function mapTransferStatus(status: string): TransferStatus {
  switch (status) {
    case 'processed':
      return 'PROCESSED';
    case 'failed':
      return 'FAILED';
    case 'reversed':
    case 'partially_reversed':
      return 'REVERSED';
    default:
      return 'PENDING';
  }
}

/**
 * Status only moves forward: a late "pending" never undoes "processed", and nothing
 * undoes "reversed". FAILED and PROCESSED are both final unless reversed.
 */
const RANK: Record<TransferStatus, number> = { PENDING: 0, PROCESSED: 1, FAILED: 1, REVERSED: 2 };

export function canMoveTransfer(from: TransferStatus, to: TransferStatus): boolean {
  return RANK[to] > RANK[from];
}

/** Razorpay's own description of a failed transfer. It names a rule, never a person. */
export function transferFailureReason(transfer: RazorpayTransfer): string | null {
  const error = transfer.error;
  const reason = error?.description ?? error?.reason ?? error?.code ?? null;
  return reason === null ? null : reason.slice(0, MAX_REASON_LENGTH);
}

export function secondsToDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}
