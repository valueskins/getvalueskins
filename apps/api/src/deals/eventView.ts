import type { DealEvent, DealEventKind, UserRole } from '@valueskins/shared';
import { dealEvents, users } from '../db/schema/index.js';
import { DELETED_USER_NAME } from './dealView.js';

/** The columns a deal event needs to be shown: the event, and its actor's name, role and deletion. */
export const eventColumns = {
  event: dealEvents,
  username: users.username,
  deletedAt: users.deletedAt,
  userRole: users.role,
};

export interface EventRow {
  event: typeof dealEvents.$inferSelect;
  username: string | null;
  deletedAt: Date | null;
  userRole: UserRole | null;
}

const PAYMENT_KINDS: readonly DealEventKind[] = [
  'PAYMENT_RECORDED',
  'PAYMENT_NOT_RECEIVED',
  'FEE_CAPTURED_DEAL_CHANGED',
  'EXTRA_PAYMENT_ON_PAID_ORDER',
  'FEE_AMOUNT_MISMATCH',
];

function metadataOf(event: EventRow['event']): Record<string, unknown> {
  const raw = event.metadata;
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/** What a deal event is: a payment record (written by the payment code), or a status change. */
export function eventKind(event: EventRow['event']): DealEventKind {
  const kind = metadataOf(event).kind;
  return PAYMENT_KINDS.find((k) => k === kind) ?? 'TRANSITION';
}

/** The refund reference an admin gave when cancelling, kept in the event's metadata. */
export function eventRefundReference(event: EventRow['event']): string | null {
  const reference = metadataOf(event).refundReference;
  return typeof reference === 'string' && reference !== '' ? reference : null;
}

/**
 * One event as the deal history and the admin detail show it. A deleted actor is "Deleted user",
 * never the anonymized username. The role is the actor's place on this deal: its brand, its
 * confirmed creator, an admin or the system; a user who is neither falls back to their account role.
 */
export function toEventView(
  row: EventRow,
  deal: { brandId: string; creatorId: string | null },
): DealEvent {
  const { event } = row;
  let role: DealEvent['actor']['role'] = null;
  if (event.actorType === 'SYSTEM') role = 'SYSTEM';
  else if (event.actorType === 'ADMIN') role = 'ADMIN';
  else if (event.actorId !== null && event.actorId === deal.brandId) role = 'BRAND';
  else if (event.actorId !== null && event.actorId === deal.creatorId) role = 'CREATOR';
  else role = row.userRole;

  return {
    id: event.id,
    kind: eventKind(event),
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    actor: {
      type: event.actorType,
      role,
      username: row.username ? (row.deletedAt ? DELETED_USER_NAME : row.username) : null,
    },
    note: event.note,
    refundReference: eventRefundReference(event),
    createdAt: event.createdAt.toISOString(),
  };
}
