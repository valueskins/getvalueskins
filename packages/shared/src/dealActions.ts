import {
  ADD_BILLING_TO_PUBLISH,
  ALREADY_APPLIED_MESSAGE,
  APPLICATIONS_CLOSED,
  CANCELLATION_NOT_POSSIBLE_AFTER_ADVANCE,
  CREATOR_PAYOUT_NOT_READY,
  NO_APPLICATIONS_YET,
  SET_UP_PAYOUTS_TO_APPLY,
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
  /** The creator viewer's payout account is ACTIVE. */
  payoutActive: boolean;
  /** The deal's confirmed creator has an ACTIVE payout account (the brand pays the advance to it). */
  creatorPayoutActive: boolean;
  /** The deal has a confirmed creator (a cancelled deal may never have had one). */
  hasCreator: boolean;
  hasBilling: boolean;
  /** Messages from validateDealForPublish for the draft, empty when it is ready. */
  publishIssues: readonly string[];
}

const POST_ADVANCE_STATUSES: readonly DealStatus[] = [
  'ADVANCE_PAID',
  'CONTENT_UPLOADED',
  'REVISION_REQUESTED',
  'APPROVED',
];

const CANCELLABLE_STATUSES: readonly DealStatus[] = ['OPEN', 'CONFIRMED', 'COMMISSION_PAID'];

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
  if (status === 'COMMISSION_PAID') {
    actions.push(
      input.creatorPayoutActive ? on('PAY_ADVANCE') : off('PAY_ADVANCE', CREATOR_PAYOUT_NOT_READY),
    );
  }
  if (status === 'APPROVED') actions.push(on('PAY_FINAL'));
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
  } else if (POST_ADVANCE_STATUSES.includes(status)) {
    actions.push(off('CANCEL', CANCELLATION_NOT_POSSIBLE_AFTER_ADVANCE));
  }
  return actions;
}

function creatorActions(input: DealActionsInput): DealActionState[] {
  if (input.status !== 'OPEN') return [];
  if (input.hasApplied) return [off('APPLY', ALREADY_APPLIED_MESSAGE)];
  if (!input.applicationsOpen) return [off('APPLY', APPLICATIONS_CLOSED)];
  if (!input.payoutActive) return [off('APPLY', SET_UP_PAYOUTS_TO_APPLY)];
  return [on('APPLY')];
}

function confirmedCreatorActions(input: DealActionsInput): DealActionState[] {
  if (input.status === 'ADVANCE_PAID' || input.status === 'REVISION_REQUESTED') {
    return [
      input.uploadCount >= MAX_CONTENT_UPLOADS_PER_DEAL
        ? off('UPLOAD_CONTENT', UPLOAD_LIMIT_REACHED)
        : on('UPLOAD_CONTENT'),
    ];
  }
  return [];
}
