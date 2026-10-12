import { canTransition, type ActorRole, type DealStatus } from '@valueskins/shared';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { dealEvents, deals } from '../db/schema/index.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';
import { emitDealTransition } from '../realtime/events.js';

export type Deal = typeof deals.$inferSelect;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Columns a transition may set along with the status. Identity and the status itself are not patchable. */
export type DealPatch = Partial<
  Omit<
    typeof deals.$inferInsert,
    'id' | 'shortId' | 'brandId' | 'status' | 'createdAt' | 'updatedAt'
  >
>;

export interface DealActor {
  role: ActorRole;
  /** The user id, absent for SYSTEM. */
  id?: string | null;
}

/** Runs after the transaction has committed: sockets and emails (SPEC 5.3). */
export type AfterCommitTask = (deal: Deal) => Promise<void>;

export interface TransitionDealInput {
  dealId: string;
  from: DealStatus;
  to: DealStatus;
  actor: DealActor;
  patch?: DealPatch;
  note?: string;
  metadata?: Record<string, unknown>;
  /** Runs inside the transaction on the row locked with FOR UPDATE; returns more columns to set (publish computes the breakdown here). */
  prepare?: (tx: Tx, current: Deal) => Promise<DealPatch>;
  /** Runs inside the same transaction after the status changed; a throw rolls the whole transition back (confirm uses it). */
  within?: (tx: Tx, updated: Deal) => Promise<void>;
  afterCommit?: AfterCommitTask[];
}

function invalidTransition(from: DealStatus, to: DealStatus): AppError {
  return new AppError(
    'INVALID_TRANSITION',
    409,
    `This deal can no longer move from ${from} to ${to}. It may have just changed, so reload it.`,
  );
}

function actorType(role: ActorRole): 'USER' | 'SYSTEM' | 'ADMIN' {
  if (role === 'SYSTEM') return 'SYSTEM';
  if (role === 'ADMIN') return 'ADMIN';
  return 'USER';
}

/**
 * The only way a deal's status changes (SPEC 5.3, CLAUDE.md rule 2). In one
 * transaction: UPDATE ... WHERE id AND status = :from (zero rows means someone
 * else changed it first: 409), then the deal_events row. Side effects run only
 * after commit and never fail the request.
 */
export async function transitionDeal(input: TransitionDealInput): Promise<Deal> {
  const { dealId, from, to, actor } = input;

  if (!canTransition(from, to, actor.role)) {
    throw invalidTransition(from, to);
  }

  const updated = await db.transaction(async (tx) => {
    let prepared: DealPatch = {};
    if (input.prepare) {
      const [current] = await tx
        .select()
        .from(deals)
        .where(and(eq(deals.id, dealId), eq(deals.status, from)))
        .for('update')
        .limit(1);
      if (!current) throw invalidTransition(from, to);
      prepared = await input.prepare(tx, current);
    }

    const [row] = await tx
      .update(deals)
      .set({ ...prepared, ...input.patch, status: to })
      .where(and(eq(deals.id, dealId), eq(deals.status, from)))
      .returning();
    if (!row) throw invalidTransition(from, to);

    await tx.insert(dealEvents).values({
      dealId,
      fromStatus: from,
      toStatus: to,
      actorId: actor.id ?? null,
      actorType: actorType(actor.role),
      note: input.note ?? null,
      metadata: input.metadata ?? null,
    });

    if (input.within) await input.within(tx, row);
    return row;
  });

  // Realtime (SPEC 10): once per committed transition, before the slower email tasks. It never throws.
  await emitDealTransition({ from, to, deal: updated });

  for (const task of input.afterCommit ?? []) {
    try {
      await task(updated);
    } catch (error) {
      // The transition is committed and stays so. Only the message is logged:
      // a task error can carry addresses or provider detail.
      logger.error(
        { dealId, error: error instanceof Error ? error.message : 'unknown' },
        'deal afterCommit task failed',
      );
    }
  }

  return updated;
}
