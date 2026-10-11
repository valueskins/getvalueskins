import { maskVpa, type DirectPaymentStatus, type DirectPaymentView } from '@valueskins/shared';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { directPayments } from '../db/schema/index.js';

export type DirectPaymentRow = typeof directPayments.$inferSelect;

export function directPaymentStatus(row: DirectPaymentRow): DirectPaymentStatus {
  if (row.confirmedAt) return 'CONFIRMED';
  if (row.disputedAt) return 'DISPUTED';
  return 'AWAITING_CONFIRMATION';
}

/** A record as the parties and admins see it: the UPI ID is always masked (REPLACEMENT_PLAN 2.1). */
export function toDirectPaymentView(row: DirectPaymentRow): DirectPaymentView {
  return {
    id: row.id,
    stage: row.stage,
    amountPaise: row.amountPaise,
    reference: row.reference,
    note: row.note,
    maskedVpa: maskVpa(row.paidToVpa),
    recordedAt: row.recordedAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    disputedAt: row.disputedAt?.toISOString() ?? null,
    disputeReason: row.disputeReason,
    status: directPaymentStatus(row),
  };
}

/** Every record of a deal, oldest first, including disputed ones. */
export async function listDirectPaymentRows(dealId: string): Promise<DirectPaymentRow[]> {
  return db
    .select()
    .from(directPayments)
    .where(eq(directPayments.dealId, dealId))
    .orderBy(asc(directPayments.recordedAt), asc(directPayments.id));
}
