import {
  dueStageFor,
  type DealAction,
  type DealActionState,
  type DealDetail,
  type DirectPaymentView,
  type MeResponse,
} from '@valueskins/shared';

export type Viewer = 'brand' | 'creator' | 'other';

/** How this person relates to the deal. Admin screens are W3; an admin here reads as "other". */
export function viewerOf(deal: DealDetail, me: MeResponse): Viewer {
  if (deal.brand.id === me.user.id) return 'brand';
  if (deal.creator?.id === me.user.id) return 'creator';
  return 'other';
}

/** The action as the API sent it, or undefined when it is not offered (then it is hidden). */
export function actionOf(deal: DealDetail, name: DealAction): DealActionState | undefined {
  return deal.allowedActions.find((a) => a.action === name);
}

/** The reason to show under a disabled control, or null when it can be used. */
export function reasonOf(action: DealActionState | undefined): string | null {
  if (!action) return null;
  return action.enabled ? null : (action.reason ?? 'Not available right now');
}

/** Records of the stage due now (advance in COMMISSION_PAID, final in APPROVED), oldest first. */
export function dueRecords(deal: DealDetail): DirectPaymentView[] {
  const stage = dueStageFor(deal.status);
  return stage ? deal.directPayments.filter((r) => r.stage === stage) : [];
}

/** The record waiting for the creator to confirm, if there is one. */
export function pendingRecord(deal: DealDetail): DirectPaymentView | null {
  return dueRecords(deal).find((r) => r.status === 'AWAITING_CONFIRMATION') ?? null;
}

/** The latest record the creator marked as not received, when no newer one is waiting. */
export function lastNotReceived(deal: DealDetail): DirectPaymentView | null {
  const records = dueRecords(deal);
  const last = records[records.length - 1];
  return last && last.status === 'DISPUTED' ? last : null;
}

export function at(username: string): string {
  return username === 'Deleted user' ? username : `@${username}`;
}
