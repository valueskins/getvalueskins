import type { DealNextStep, DealStatus } from '@valueskins/shared';
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

// The 9-step bar comes from shared (SPEC 18), so the web, the PDFs and the emails agree.
export {
  STEP_LABELS,
  currentStepNumber,
  dealStep,
  dealSteps,
  type DealStep,
  type StepState,
} from '@valueskins/shared';
