import type { DealStatus } from './dealStateMachine.js';

/**
 * The 9-step bar shown on every deal (SPEC 18, DESIGN_HANDOFF). One place maps a status to a step,
 * so the web, and later the PDFs and emails, can never disagree. Steps never move back: Changes
 * requested stays on Review.
 */
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

export type StepLabel = (typeof STEP_LABELS)[number];
export type StepState = 'done' | 'current' | 'todo' | 'stopped' | 'void';

export interface DealStep {
  label: StepLabel;
  state: StepState;
  /** When the step was finished, if the deal records it. */
  at: string | null;
}

/** How many of the 9 steps a live deal has finished. */
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

/**
 * The step a deal in this status is on, 1 to 9 (9 once completed). Null for CANCELLED: where a
 * cancelled deal stopped depends on how far it got, which `dealSteps` reads from its timestamps.
 */
export function dealStep(status: DealStatus): number | null {
  if (status === 'CANCELLED') return null;
  return Math.min(DONE_BY_STATUS[status] + 1, STEP_LABELS.length);
}

/** The deal fields the bar needs. Dates are ISO strings, as the API sends them. */
export interface StepDates {
  status: DealStatus;
  publishedAt: string | null;
  confirmedAt: string | null;
  commissionPaidAt: string | null;
  advancePaidAt: string | null;
  contentUploadedAt: string | null;
  approvedAt: string | null;
  completedAt: string | null;
}

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

/** The whole bar: finished steps with their dates, the current one, and the rest. */
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
  const cancelled = d.status === 'CANCELLED';
  const done = d.status === 'CANCELLED' ? doneBeforeCancel(d) : DONE_BY_STATUS[d.status];
  return STEP_LABELS.map((label, i) => {
    let state: StepState;
    if (i < done) state = 'done';
    else if (i === done) state = cancelled ? 'stopped' : 'current';
    else state = cancelled ? 'void' : 'todo';
    return { label, state, at: i < done ? (dates[i] ?? null) : null };
  });
}

/** 1-based number of the current (or stopped) step, 9 when completed, for the compact bar. */
export function currentStepNumber(steps: DealStep[]): number {
  const i = steps.findIndex((s) => s.state === 'current' || s.state === 'stopped');
  return i === -1 ? steps.length : i + 1;
}
