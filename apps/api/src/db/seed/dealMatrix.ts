import {
  computeBreakdown,
  DEAL_STATUSES,
  rupeesToPaise,
  type ActorRole,
  type DealStatus,
} from '@valueskins/shared';
import { v7 as uuidv7 } from 'uuid';
import type { db as Database } from '../client.js';
import {
  applications,
  contentUploads,
  deals,
  dealEvents,
  payments,
  transfers,
} from '../schema/index.js';

interface TransitionStep {
  from: DealStatus;
  to: DealStatus;
  actorRole: ActorRole;
}

const TO_OPEN: TransitionStep[] = [{ from: 'DRAFT', to: 'OPEN', actorRole: 'BRAND' }];
const TO_CONFIRMED: TransitionStep[] = [
  ...TO_OPEN,
  { from: 'OPEN', to: 'CONFIRMED', actorRole: 'BRAND' },
];
const TO_COMMISSION_PAID: TransitionStep[] = [
  ...TO_CONFIRMED,
  { from: 'CONFIRMED', to: 'COMMISSION_PAID', actorRole: 'SYSTEM' },
];
const TO_ADVANCE_PAID: TransitionStep[] = [
  ...TO_COMMISSION_PAID,
  { from: 'COMMISSION_PAID', to: 'ADVANCE_PAID', actorRole: 'SYSTEM' },
];
const TO_CONTENT_UPLOADED: TransitionStep[] = [
  ...TO_ADVANCE_PAID,
  { from: 'ADVANCE_PAID', to: 'CONTENT_UPLOADED', actorRole: 'CREATOR' },
];
const TO_REVISION_REQUESTED: TransitionStep[] = [
  ...TO_CONTENT_UPLOADED,
  { from: 'CONTENT_UPLOADED', to: 'REVISION_REQUESTED', actorRole: 'BRAND' },
];
const TO_APPROVED: TransitionStep[] = [
  ...TO_CONTENT_UPLOADED,
  { from: 'CONTENT_UPLOADED', to: 'APPROVED', actorRole: 'BRAND' },
];
const TO_COMPLETED: TransitionStep[] = [
  ...TO_APPROVED,
  { from: 'APPROVED', to: 'COMPLETED', actorRole: 'SYSTEM' },
];
const TO_CANCELLED: TransitionStep[] = [
  ...TO_CONFIRMED,
  { from: 'CONFIRMED', to: 'CANCELLED', actorRole: 'BRAND' },
];

/** The shortest valid path (per DEAL_TRANSITIONS) from DRAFT to each checkpoint status. */
const PATH_BY_STATUS: Record<DealStatus, TransitionStep[]> = {
  DRAFT: [],
  OPEN: TO_OPEN,
  CONFIRMED: TO_CONFIRMED,
  COMMISSION_PAID: TO_COMMISSION_PAID,
  ADVANCE_PAID: TO_ADVANCE_PAID,
  CONTENT_UPLOADED: TO_CONTENT_UPLOADED,
  REVISION_REQUESTED: TO_REVISION_REQUESTED,
  APPROVED: TO_APPROVED,
  COMPLETED: TO_COMPLETED,
  CANCELLED: TO_CANCELLED,
};

function includesEdge(path: TransitionStep[], from: DealStatus, to: DealStatus): boolean {
  return path.some((step) => step.from === from && step.to === to);
}

export interface DealCheckpointInput {
  status: DealStatus;
  index: number;
  brandId: string;
  confirmedCreatorId: string;
  applicantCreatorId: string;
  budgetRupees: number;
  applicationDeadline: string;
  contentUploadDeadline: string;
  dealDeadline: string;
}

/**
 * Inserts one deal frozen at `status`, plus the deal_events, applications,
 * payments, transfers, and content_uploads rows a real transitionDeal() flow
 * would have produced getting it there.
 */
export async function insertDealAtCheckpoint(
  db: typeof Database,
  input: DealCheckpointInput,
): Promise<void> {
  const path = PATH_BY_STATUS[input.status];
  const dealId = uuidv7();
  const shortId = `SEED${String(input.index).padStart(4, '0')}`;
  const now = new Date();

  const isPublished = includesEdge(path, 'DRAFT', 'OPEN');
  const isConfirmed = includesEdge(path, 'OPEN', 'CONFIRMED');
  const isCommissionPaid = includesEdge(path, 'CONFIRMED', 'COMMISSION_PAID');
  const isAdvancePaid = includesEdge(path, 'COMMISSION_PAID', 'ADVANCE_PAID');
  const isContentUploaded = includesEdge(path, 'ADVANCE_PAID', 'CONTENT_UPLOADED');
  const isRevisionRequested = includesEdge(path, 'CONTENT_UPLOADED', 'REVISION_REQUESTED');
  const isApproved = includesEdge(path, 'CONTENT_UPLOADED', 'APPROVED');
  const isCompleted = includesEdge(path, 'APPROVED', 'COMPLETED');
  const isCancelled = includesEdge(path, 'CONFIRMED', 'CANCELLED');

  const breakdown = isPublished ? computeBreakdown(rupeesToPaise(input.budgetRupees)) : null;

  await db.insert(deals).values({
    id: dealId,
    shortId,
    brandId: input.brandId,
    creatorId: isConfirmed ? input.confirmedCreatorId : null,
    title: `Seed deal - ${input.status}`,
    description: `Seed fixture frozen at status ${input.status}.`,
    budgetPaise: breakdown?.budgetPaise ?? null,
    commissionBasePaise: breakdown?.commissionBasePaise ?? null,
    commissionGstPaise: breakdown?.commissionGstPaise ?? null,
    commissionTotalPaise: breakdown?.commissionTotalPaise ?? null,
    creatorAmountPaise: breakdown?.creatorAmountPaise ?? null,
    advancePaise: breakdown?.advancePaise ?? null,
    finalPaise: breakdown?.finalPaise ?? null,
    applicationDeadline: input.applicationDeadline,
    contentUploadDeadline: input.contentUploadDeadline,
    dealDeadline: input.dealDeadline,
    status: input.status,
    contentLink: isContentUploaded ? 'https://drive.google.com/file/d/seed-content/view' : null,
    contentUploadedAt: isContentUploaded ? now : null,
    uploadCount: isContentUploaded ? 1 : 0,
    feedback: isRevisionRequested ? 'Please reshoot the intro scene.' : null,
    revisionCount: isRevisionRequested ? 1 : 0,
    publishedAt: isPublished ? now : null,
    confirmedAt: isConfirmed ? now : null,
    commissionPaidAt: isCommissionPaid ? now : null,
    advancePaidAt: isAdvancePaid ? now : null,
    approvedAt: isApproved ? now : null,
    completedAt: isCompleted ? now : null,
    cancelledAt: isCancelled ? now : null,
    cancelledById: isCancelled ? input.brandId : null,
    cancelledByRole: isCancelled ? 'BRAND' : null,
    cancellationReason: isCancelled ? 'Brand no longer needs this deliverable.' : null,
  });

  for (const step of path) {
    const actorId =
      step.actorRole === 'BRAND'
        ? input.brandId
        : step.actorRole === 'CREATOR'
          ? input.confirmedCreatorId
          : null;
    const actorType = step.actorRole === 'SYSTEM' ? 'SYSTEM' : 'USER';

    await db.insert(dealEvents).values({
      dealId,
      fromStatus: step.from,
      toStatus: step.to,
      actorId,
      actorType,
      note: null,
    });
  }

  if (isPublished && !isConfirmed) {
    // The deal is OPEN but not yet confirmed: seed a single pending applicant.
    await db.insert(applications).values({
      dealId,
      creatorId: input.applicantCreatorId,
      status: 'APPLIED',
    });
  } else if (isConfirmed) {
    await db.insert(applications).values({
      dealId,
      creatorId: input.confirmedCreatorId,
      status: 'CONFIRMED',
    });
  }

  if (isContentUploaded) {
    await db.insert(contentUploads).values({
      dealId,
      link: 'https://drive.google.com/file/d/seed-content/view',
      uploadedAt: now,
    });
  }

  if (breakdown && isCommissionPaid) {
    await db.insert(payments).values({
      dealId,
      type: 'COMMISSION',
      amountPaise: breakdown.commissionTotalPaise,
      razorpayOrderId: `order_seed_${input.index}_commission`,
      razorpayPaymentId: `pay_seed_${input.index}_commission`,
      status: 'CAPTURED',
      capturedAt: now,
    });
  }

  if (breakdown && isAdvancePaid) {
    const [advancePayment] = await db
      .insert(payments)
      .values({
        dealId,
        type: 'ADVANCE',
        amountPaise: breakdown.advancePaise,
        razorpayOrderId: `order_seed_${input.index}_advance`,
        razorpayPaymentId: `pay_seed_${input.index}_advance`,
        status: 'CAPTURED',
        capturedAt: now,
      })
      .returning();

    if (advancePayment) {
      await db.insert(transfers).values({
        dealId,
        paymentId: advancePayment.id,
        creatorId: input.confirmedCreatorId,
        type: 'ADVANCE',
        amountPaise: breakdown.advancePaise,
        razorpayTransferId: `trf_seed_${input.index}_advance`,
        status: 'PROCESSED',
        processedAt: now,
      });
    }
  }

  if (breakdown && isCompleted) {
    const [finalPayment] = await db
      .insert(payments)
      .values({
        dealId,
        type: 'FINAL',
        amountPaise: breakdown.finalPaise,
        razorpayOrderId: `order_seed_${input.index}_final`,
        razorpayPaymentId: `pay_seed_${input.index}_final`,
        status: 'CAPTURED',
        capturedAt: now,
      })
      .returning();

    if (finalPayment) {
      await db.insert(transfers).values({
        dealId,
        paymentId: finalPayment.id,
        creatorId: input.confirmedCreatorId,
        type: 'FINAL',
        amountPaise: breakdown.finalPaise,
        razorpayTransferId: `trf_seed_${input.index}_final`,
        status: 'PROCESSED',
        processedAt: now,
      });
    }
  }
}

export const SEED_DEAL_STATUSES: readonly DealStatus[] = DEAL_STATUSES;
