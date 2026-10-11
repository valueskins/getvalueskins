import {
  PAYMENT_RAIL_CHANGED,
  TRANSFER_STATE_CONFLICT,
  type MarkManualInput,
} from '@valueskins/shared';
import { and, eq } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/types.js';
import { db } from '../db/client.js';
import { transfers } from '../db/schema/index.js';
import { notFound, parseId } from '../deals/access.js';
import { AppError } from '../errors/AppError.js';
import { transferView } from './adminDeals.service.js';

function stateConflict(): AppError {
  return new AppError('TRANSFER_STATE_CONFLICT', 409, TRANSFER_STATE_CONFLICT);
}

/**
 * POST /admin/transfers/:id/retry (SPEC 12). A retry creates a Razorpay Route transfer, and Route
 * is not available to ValueSkins (REPLACEMENT_PLAN 0), so it never calls Razorpay: an unknown id
 * is a 404, every real transfer is `409 PAYMENT_RAIL_CHANGED`. Prompt 13 removes the route.
 */
export async function retryTransfer(rawId: unknown): Promise<never> {
  const [row] = await db
    .select({ id: transfers.id })
    .from(transfers)
    .where(eq(transfers.id, parseId(rawId)))
    .limit(1);
  if (!row) throw notFound();
  throw new AppError('PAYMENT_RAIL_CHANGED', 409, PAYMENT_RAIL_CHANGED);
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
