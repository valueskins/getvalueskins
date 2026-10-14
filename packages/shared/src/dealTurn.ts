import type { DealStatus } from './dealStateMachine.js';
import type { DirectPaymentStage } from './enums.js';

/**
 * What has to happen next on a deal, whoever the viewer is. `WAIT_FOR_APPLICANTS` has no actor:
 * nobody has to act until a creator applies.
 */
export const DEAL_NEXT_STEPS = [
  'PUBLISH',
  'WAIT_FOR_APPLICANTS',
  'CONFIRM_CREATOR',
  'PAY_FEE',
  'PAY_ADVANCE',
  'CONFIRM_PAYMENT',
  'UPLOAD_CONTENT',
  'REVIEW_CONTENT',
  'PAY_FINAL',
] as const;

export type DealNextStep = (typeof DEAL_NEXT_STEPS)[number];
export type TurnActor = 'BRAND' | 'CREATOR';

/** The direct payment a deal is waiting for, by status (REPLACEMENT_PLAN 2.1). */
export const DUE_STAGE_BY_STATUS: Partial<Record<DealStatus, DirectPaymentStage>> = {
  COMMISSION_PAID: 'ADVANCE',
  APPROVED: 'FINAL',
};

export function dueStageFor(status: DealStatus): DirectPaymentStage | null {
  return DUE_STAGE_BY_STATUS[status] ?? null;
}

export interface DealTurnInput {
  status: DealStatus;
  /** Applications on the deal, of any status. */
  applicantCount: number;
  /** A direct payment for the due stage is recorded and waits for the creator. */
  pendingRecord: boolean;
}

export interface DealTurn {
  nextStep: DealNextStep | null;
  /** Who has to act, or null when nobody does (waiting for applicants, finished, cancelled). */
  actor: TurnActor | null;
}

/**
 * Pure: whose turn it is on a deal and what they do (SPEC 5.5). A turn that is blocked, for
 * example by a creator with no UPI ID, is still that person's turn: the deal page shows the reason.
 * `computeDealActions` is the permission rule; a test keeps the two in step.
 */
export function computeDealTurn(input: DealTurnInput): DealTurn {
  switch (input.status) {
    case 'DRAFT':
      return { nextStep: 'PUBLISH', actor: 'BRAND' };
    case 'OPEN':
      return input.applicantCount > 0
        ? { nextStep: 'CONFIRM_CREATOR', actor: 'BRAND' }
        : { nextStep: 'WAIT_FOR_APPLICANTS', actor: null };
    case 'CONFIRMED':
      return { nextStep: 'PAY_FEE', actor: 'BRAND' };
    case 'COMMISSION_PAID':
      return input.pendingRecord
        ? { nextStep: 'CONFIRM_PAYMENT', actor: 'CREATOR' }
        : { nextStep: 'PAY_ADVANCE', actor: 'BRAND' };
    case 'ADVANCE_PAID':
    case 'REVISION_REQUESTED':
      return { nextStep: 'UPLOAD_CONTENT', actor: 'CREATOR' };
    case 'CONTENT_UPLOADED':
      return { nextStep: 'REVIEW_CONTENT', actor: 'BRAND' };
    case 'APPROVED':
      return input.pendingRecord
        ? { nextStep: 'CONFIRM_PAYMENT', actor: 'CREATOR' }
        : { nextStep: 'PAY_FINAL', actor: 'BRAND' };
    case 'COMPLETED':
    case 'CANCELLED':
      return { nextStep: null, actor: null };
  }
}

/** True when the viewer is the one who has to act next. */
export function isYourTurn(turn: DealTurn, role: TurnActor): boolean {
  return turn.actor === role;
}
