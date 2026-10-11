import {
  ADD_BILLING_TO_PUBLISH,
  ALREADY_APPLIED_MESSAGE,
  APPLICATIONS_CLOSED,
  CANCELLATION_NOT_POSSIBLE_AFTER_FEE,
  ADD_UPI_TO_APPLY,
  NO_APPLICATIONS_YET,
  CREATOR_HAS_NO_UPI,
  NO_PAYMENT_RECORDED_YET,
  WAITING_FOR_CREATOR_TO_CONFIRM,
  UPLOAD_LIMIT_REACHED,
} from './copy.js';
import { MAX_CONTENT_UPLOADS_PER_DEAL } from './config.js';
import type { DealStatus } from './dealStateMachine.js';

/** Actions that have an endpoint today. */
export const DEAL_ACTIONS = [
  'EDIT_DRAFT',
  'DELETE_DRAFT',
  'PUBLISH',
  'CONFIRM_CREATOR',
  'CANCEL',
  'APPLY',
  'PAY_COMMISSION',
  'PAY_ADVANCE',
  'PAY_FINAL',
  'CONFIRM_PAYMENT_RECEIVED',
  'UPLOAD_CONTENT',
  'SEND_FEEDBACK',
  'APPROVE',
  'RAISE_DISPUTE',
] as const;

export type DealAction = (typeof DEAL_ACTIONS)[number];

export interface DealActionState {
  action: DealAction;
  enabled: boolean;
  /** Why the action is disabled (SPEC 18: every disabled action says why). Null when enabled. */
  reason: string | null;
}

export interface DealActionsInput {
  status: DealStatus;
  /**
   * BRAND_OWNER: the deal's brand. CONFIRMED_CREATOR: the creator the deal was confirmed with.
   * CREATOR: any other creator looking at the deal. NONE: everyone else, admins included.
   */
  viewer: 'BRAND_OWNER' | 'CONFIRMED_CREATOR' | 'CREATOR' | 'NONE';
  /** Content links uploaded so far (SPEC 13: at most 20 per deal). */
  uploadCount: number;
  applicationsOpen: boolean;
  applicationCount: number;
  /** The creator viewer already has an application on this deal. */
  hasApplied: boolean;
  /** The creator viewer has saved a UPI ID, a name and consent (REPLACEMENT_PLAN 2.1). */
  payoutSet: boolean;
  /** The deal has a confirmed creator (a cancelled deal may never have had one). */
  hasCreator: boolean;
  /** The deal's confirmed creator has saved a UPI ID, a name and consent (the brand pays to it). */
  creatorPayoutSet: boolean;
  /** A direct payment for the stage that is due is recorded and waits for the creator. */
  pendingRecord: boolean;
  hasBilling: boolean;
  /** Messages from validateDealForPublish for the draft, empty when it is ready. */
  publishIssues: readonly string[];
}

/** The fee is paid, so only an admin can cancel (REPLACEMENT_PLAN 2.6). */
const FEE_PAID_STATUSES: readonly DealStatus[] = [
  'COMMISSION_PAID',
  'ADVANCE_PAID',
  'CONTENT_UPLOADED',
  'REVISION_REQUESTED',
  'APPROVED',
];

const CANCELLABLE_STATUSES: readonly DealStatus[] = ['OPEN', 'CONFIRMED'];

/**
 * SPEC 12: a dispute can be raised from CONFIRMED onward, so the deal needs a confirmed creator
 * and must be past OPEN. A deal cancelled before a creator was confirmed has nothing to dispute.
 */
export function disputeAllowed(status: DealStatus, hasCreator: boolean): boolean {
  return hasCreator && status !== 'DRAFT' && status !== 'OPEN';
}

function on(action: DealAction): DealActionState {
  return { action, enabled: true, reason: null };
}

function off(action: DealAction, reason: string): DealActionState {
  return { action, enabled: false, reason };
}

/** The actions the viewer can take, or sees disabled with a reason, on a deal right now (SPEC 5.2, 5.4, 5.5, 18). */
export function computeDealActions(input: DealActionsInput): DealActionState[] {
  if (input.viewer === 'BRAND_OWNER') return withDispute(input, brandActions(input));
  if (input.viewer === 'CONFIRMED_CREATOR') {
    return withDispute(input, confirmedCreatorActions(input));
  }
  if (input.viewer === 'CREATOR') return creatorActions(input);
  return [];
}

/** Both parties can raise a dispute once the deal allows it; otherwise the action is not listed. */
function withDispute(input: DealActionsInput, actions: DealActionState[]): DealActionState[] {
  return disputeAllowed(input.status, input.hasCreator)
    ? [...actions, on('RAISE_DISPUTE')]
    : actions;
}

function brandActions(input: DealActionsInput): DealActionState[] {
  const { status } = input;
  if (status === 'DRAFT') {
    let publish = on('PUBLISH');
    if (!input.hasBilling) publish = off('PUBLISH', ADD_BILLING_TO_PUBLISH);
    else if (input.publishIssues[0] !== undefined) publish = off('PUBLISH', input.publishIssues[0]);
    return [on('EDIT_DRAFT'), on('DELETE_DRAFT'), publish];
  }

  const actions: DealActionState[] = [];
  if (status === 'CONFIRMED') actions.push(on('PAY_COMMISSION'));
  if (status === 'COMMISSION_PAID') actions.push(payAction('PAY_ADVANCE', input));
  if (status === 'APPROVED') actions.push(payAction('PAY_FINAL', input));
  if (status === 'CONTENT_UPLOADED') actions.push(on('SEND_FEEDBACK'), on('APPROVE'));
  if (status === 'OPEN') {
    actions.push(
      input.applicationCount > 0
        ? on('CONFIRM_CREATOR')
        : off('CONFIRM_CREATOR', NO_APPLICATIONS_YET),
    );
  }
  if (CANCELLABLE_STATUSES.includes(status)) {
    actions.push(on('CANCEL'));
  } else if (FEE_PAID_STATUSES.includes(status)) {
    actions.push(off('CANCEL', CANCELLATION_NOT_POSSIBLE_AFTER_FEE));
  }
  return actions;
}

/** PAY_ADVANCE and PAY_FINAL mean "pay by UPI and record it" (REPLACEMENT_PLAN 2.1). */
function payAction(action: 'PAY_ADVANCE' | 'PAY_FINAL', input: DealActionsInput): DealActionState {
  if (input.pendingRecord) return off(action, WAITING_FOR_CREATOR_TO_CONFIRM);
  if (!input.creatorPayoutSet) return off(action, CREATOR_HAS_NO_UPI);
  return on(action);
}

function creatorActions(input: DealActionsInput): DealActionState[] {
  if (input.status !== 'OPEN') return [];
  if (input.hasApplied) return [off('APPLY', ALREADY_APPLIED_MESSAGE)];
  if (!input.applicationsOpen) return [off('APPLY', APPLICATIONS_CLOSED)];
  if (!input.payoutSet) return [off('APPLY', ADD_UPI_TO_APPLY)];
  return [on('APPLY')];
}

function confirmedCreatorActions(input: DealActionsInput): DealActionState[] {
  if (input.status === 'COMMISSION_PAID' || input.status === 'APPROVED') {
    return [
      input.pendingRecord
        ? on('CONFIRM_PAYMENT_RECEIVED')
        : off('CONFIRM_PAYMENT_RECEIVED', NO_PAYMENT_RECORDED_YET),
    ];
  }
  if (input.status === 'ADVANCE_PAID' || input.status === 'REVISION_REQUESTED') {
    return [
      input.uploadCount >= MAX_CONTENT_UPLOADS_PER_DEAL
        ? off('UPLOAD_CONTENT', UPLOAD_LIMIT_REACHED)
        : on('UPLOAD_CONTENT'),
    ];
  }
  return [];
}
