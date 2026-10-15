import type { DealAction, DealDetail, DealStatus, DirectPaymentView } from '@valueskins/shared';
import { computeBreakdown } from '@valueskins/shared';

export const BRAND = {
  id: '0190a0e8-52b5-75d3-999f-4570bcd49001',
  username: 'test.brand',
  profilePictureUrl: null,
};
export const CREATOR = {
  id: '0190a0e8-52b5-75d3-999f-4570bcd49002',
  username: 'test.creator',
  profilePictureUrl: null,
};
export const DEAL_ID = '0190a0e8-52b5-75d3-999f-4570bcd49100';

const b = computeBreakdown(1_000_000, 1800);

/** One action as the API sends it. */
export function act(action: DealAction, reason: string | null = null) {
  return { action, enabled: reason === null, reason };
}

export function record(over: Partial<DirectPaymentView> = {}): DirectPaymentView {
  return {
    id: '0190a0e8-52b5-75d3-999f-4570bcd49200',
    stage: 'ADVANCE',
    amountPaise: b.advancePaise,
    reference: '412345678901',
    note: null,
    maskedVpa: 'te•••@okfakebank',
    recordedAt: '2026-10-02T12:40:00.000Z',
    confirmedAt: null,
    disputedAt: null,
    disputeReason: null,
    status: 'AWAITING_CONFIRMATION',
    ...over,
  };
}

/** A GET /deals/:id body with obviously fake data, in the given status. */
export function makeDeal(status: DealStatus, over: Partial<DealDetail> = {}): DealDetail {
  const reached = (s: DealStatus[]) => s.includes(status);
  const confirmed = !reached(['DRAFT', 'OPEN']) && !(status === 'CANCELLED' && !over.creator);
  return {
    id: DEAL_ID,
    shortId: '8K2M4QXZ',
    status,
    title: 'Test kurta reel',
    description: 'Content type: 1 reel\nShooting: At home',
    budgetPaise: b.budgetPaise,
    creatorAmountPaise: b.creatorAmountPaise,
    advancePaise: b.advancePaise,
    finalPaise: b.finalPaise,
    applicationDeadline: '2026-10-02',
    contentUploadDeadline: '2026-10-10',
    dealDeadline: '2026-10-14',
    publishedAt: '2026-10-01T02:35:00.000Z',
    createdAt: '2026-10-01T02:30:00.000Z',
    brand: BRAND,
    commissionBasePaise: b.commissionBasePaise,
    commissionGstPaise: b.commissionGstPaise,
    commissionTotalPaise: b.commissionTotalPaise,
    confirmedAt: confirmed ? '2026-10-02T05:50:00.000Z' : null,
    cancelledAt: null,
    cancelledByRole: null,
    cancellationReason: null,
    commissionPaidAt: reached([
      'COMMISSION_PAID',
      'ADVANCE_PAID',
      'CONTENT_UPLOADED',
      'REVISION_REQUESTED',
      'APPROVED',
      'COMPLETED',
    ])
      ? '2026-10-02T06:04:00.000Z'
      : null,
    advancePaidAt: reached([
      'ADVANCE_PAID',
      'CONTENT_UPLOADED',
      'REVISION_REQUESTED',
      'APPROVED',
      'COMPLETED',
    ])
      ? '2026-10-03T08:45:00.000Z'
      : null,
    approvedAt: reached(['APPROVED', 'COMPLETED']) ? '2026-10-11T04:30:00.000Z' : null,
    completedAt: status === 'COMPLETED' ? '2026-10-11T12:35:00.000Z' : null,
    contentLink: null,
    contentUploadedAt: null,
    uploadCount: 0,
    revisionCount: 0,
    feedback: null,
    contentUploads: [],
    revisionNotice: null,
    creator: confirmed ? CREATOR : null,
    creatorPayoutSet: confirmed ? true : null,
    directPayments: [],
    documents: [],
    disputes: [],
    applicationCount: 0,
    applicationsOpen: status === 'OPEN',
    contentOverdue: false,
    allowedActions: [],
    ...over,
  };
}
