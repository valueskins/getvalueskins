import type { DealDetail, DealNextStep, DealStatus } from '@valueskins/shared';
import type { BadgeKind } from '@/components/ui/Callout';

/** Status labels and badges (DESIGN_HANDOFF section 4). Users never see the raw status. */
export const STATUS_LABEL: Record<DealStatus, string> = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  CONFIRMED: 'Confirmed',
  COMMISSION_PAID: 'Fee paid',
  ADVANCE_PAID: 'Advance confirmed',
  CONTENT_UPLOADED: 'Content shared',
  REVISION_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const STATUS_BADGE: Record<DealStatus, BadgeKind> = {
  DRAFT: 'draft',
  OPEN: 'open',
  CONFIRMED: 'progress',
  COMMISSION_PAID: 'progress',
  ADVANCE_PAID: 'progress',
  CONTENT_UPLOADED: 'progress',
  REVISION_REQUESTED: 'wait',
  APPROVED: 'ok',
  COMPLETED: 'done',
  CANCELLED: 'cancelled',
};

/** What the person whose turn it is does next, for list rows (`nextStep` from GET /deals/mine). */
export const NEXT_STEP_LABEL: Record<DealNextStep, { brand: string; creator: string }> = {
  PUBLISH: { brand: 'Publish the draft', creator: 'Waiting for the brand to publish' },
  WAIT_FOR_APPLICANTS: { brand: 'Waiting for applicants', creator: 'Waiting for applicants' },
  CONFIRM_CREATOR: {
    brand: 'Confirm a creator',
    creator: 'Waiting for the brand to pick a creator',
  },
  PAY_FEE: { brand: 'Pay the ValueSkins fee', creator: 'Waiting for the brand to pay the fee' },
  PAY_ADVANCE: {
    brand: 'Pay the 30% advance by UPI',
    creator: 'Waiting for the brand to pay the advance',
  },
  CONFIRM_PAYMENT: {
    brand: 'Waiting for the creator to confirm the payment',
    creator: 'Confirm the payment arrived',
  },
  UPLOAD_CONTENT: { brand: 'Waiting for the content', creator: 'Share your content' },
  REVIEW_CONTENT: { brand: 'Review the content', creator: 'Waiting for the review' },
  PAY_FINAL: {
    brand: 'Pay the final 70% by UPI',
    creator: 'Waiting for the brand to pay the final amount',
  },
};

export const STEP_LABELS = [
  'Posted',
  'Creator confirmed',
  'Fee paid',
  'Advance confirmed',
  'Content shared',
  'Review',
  'Approved',
  'Final confirmed',
  'Completed',
] as const;

export type StepState = 'done' | 'current' | 'todo' | 'stopped' | 'void';

export interface DealStep {
  label: (typeof STEP_LABELS)[number];
  state: StepState;
  /** When the step was finished, if the API records it. */
  at: string | null;
}

/** How many of the 9 steps a live deal has finished. Changes requested stays on Review. */
const DONE_BY_STATUS: Record<Exclude<DealStatus, 'CANCELLED'>, number> = {
  DRAFT: 0,
  OPEN: 1,
  CONFIRMED: 2,
  COMMISSION_PAID: 3,
  ADVANCE_PAID: 4,
  CONTENT_UPLOADED: 5,
  REVISION_REQUESTED: 5,
  APPROVED: 7,
  COMPLETED: 9,
};

type StepDates = Pick<
  DealDetail,
  | 'status'
  | 'publishedAt'
  | 'confirmedAt'
  | 'commissionPaidAt'
  | 'advancePaidAt'
  | 'contentUploadedAt'
  | 'approvedAt'
  | 'completedAt'
>;

/** For a cancelled deal: how far it got, read from the timestamps it collected. */
function doneBeforeCancel(d: StepDates): number {
  if (d.approvedAt) return 7;
  if (d.contentUploadedAt) return 5;
  if (d.advancePaidAt) return 4;
  if (d.commissionPaidAt) return 3;
  if (d.confirmedAt) return 2;
  if (d.publishedAt) return 1;
  return 0;
}

/**
 * The 9-step bar (DESIGN_HANDOFF). The API has no step field, so the web maps
 * the status (docs/WEB_API_GAPS.md). Steps never move back.
 */
export function dealSteps(d: StepDates): DealStep[] {
  const dates = [
    d.publishedAt,
    d.confirmedAt,
    d.commissionPaidAt,
    d.advancePaidAt,
    d.contentUploadedAt,
    d.approvedAt,
    d.approvedAt,
    d.completedAt,
    d.completedAt,
  ];
  const status = d.status;
  const cancelled = status === 'CANCELLED';
  const done = status === 'CANCELLED' ? doneBeforeCancel(d) : DONE_BY_STATUS[status];
  return STEP_LABELS.map((label, i) => {
    let state: StepState;
    if (i < done) state = 'done';
    else if (i === done) state = cancelled ? 'stopped' : 'current';
    else state = cancelled ? 'void' : 'todo';
    return { label, state, at: i < done ? (dates[i] ?? null) : null };
  });
}

/** 1-based number of the current step (9 when completed), for the compact bar. */
export function currentStepNumber(steps: DealStep[]): number {
  const i = steps.findIndex((s) => s.state === 'current' || s.state === 'stopped');
  return i === -1 ? steps.length : i + 1;
}
