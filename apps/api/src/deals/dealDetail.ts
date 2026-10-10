import {
  FIVE_REVISIONS_WARNING,
  applicationsOpen,
  computeDealActions,
  contentOverdue,
  validateDealForPublish,
  type DealDetail,
} from '@valueskins/shared';
import { and, asc, count, eq } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/types.js';
import { db } from '../db/client.js';
import { applications, brandBilling, contentUploads } from '../db/schema/index.js';
import { iso, loadParties, toSummary } from './dealView.js';
import { getPayoutStatus } from './payoutStatus.js';
import type { Deal } from './stateMachine.js';

/** What the draft form still needs before it can be published, as messages. */
export function publishIssueMessages(deal: Deal, now: Date): string[] {
  return validateDealForPublish(
    {
      title: deal.title,
      description: deal.description,
      budgetPaise: deal.budgetPaise,
      applicationDeadline: deal.applicationDeadline,
      contentUploadDeadline: deal.contentUploadDeadline,
      dealDeadline: deal.dealDeadline,
    },
    now,
  ).map((issue) => issue.message);
}

export async function hasBillingDetails(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: brandBilling.userId })
    .from(brandBilling)
    .where(eq(brandBilling.userId, userId))
    .limit(1);
  return row !== undefined;
}

/** The GET /deals/:id body for a viewer who is allowed to see the deal (SPEC 16). */
export async function buildDealDetail(
  deal: Deal,
  viewer: AuthenticatedUser,
  now: Date,
): Promise<DealDetail> {
  const isOwner = deal.brandId === viewer.id;
  const privileged = isOwner || viewer.isAdmin;

  const parties = await loadParties(
    deal.creatorId ? [deal.brandId, deal.creatorId] : [deal.brandId],
  );
  const brand = parties.get(deal.brandId);
  if (!brand) throw new Error(`deal ${deal.id} has no brand row`);
  const creator = deal.creatorId ? (parties.get(deal.creatorId) ?? null) : null;

  const open = applicationsOpen(
    { status: deal.status, applicationDeadline: deal.applicationDeadline ?? '1970-01-01' },
    now,
  );
  const overdue = contentOverdue(
    { status: deal.status, contentUploadDeadline: deal.contentUploadDeadline ?? '9999-12-31' },
    now,
  );

  let applicationCount: number | null = null;
  if (privileged) {
    const [row] = await db
      .select({ value: count() })
      .from(applications)
      .where(eq(applications.dealId, deal.id));
    applicationCount = row?.value ?? 0;
  }

  const creatorPayoutStatus =
    privileged && deal.creatorId ? await getPayoutStatus(deal.creatorId) : null;

  const isConfirmedCreator = deal.creatorId !== null && deal.creatorId === viewer.id;
  let viewerKind: 'BRAND_OWNER' | 'CONFIRMED_CREATOR' | 'CREATOR' | 'NONE' = 'NONE';
  if (isOwner) viewerKind = 'BRAND_OWNER';
  else if (isConfirmedCreator) viewerKind = 'CONFIRMED_CREATOR';
  else if (viewer.role === 'CREATOR') viewerKind = 'CREATOR';

  // Delivery history is for the two parties and admins; an OPEN deal has none anyway.
  const seesDelivery = privileged || isConfirmedCreator;
  const uploads = seesDelivery
    ? await db
        .select({ link: contentUploads.link, uploadedAt: contentUploads.uploadedAt })
        .from(contentUploads)
        .where(eq(contentUploads.dealId, deal.id))
        .orderBy(asc(contentUploads.uploadedAt), asc(contentUploads.id))
    : [];

  let hasApplied = false;
  let payoutActive = false;
  if (viewerKind === 'CREATOR' && deal.status === 'OPEN') {
    const [existing] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.dealId, deal.id), eq(applications.creatorId, viewer.id)))
      .limit(1);
    hasApplied = existing !== undefined;
    payoutActive = (await getPayoutStatus(viewer.id)) === 'ACTIVE';
  }

  const hasBilling = viewerKind === 'BRAND_OWNER' ? await hasBillingDetails(viewer.id) : false;
  const publishIssues =
    viewerKind === 'BRAND_OWNER' && deal.status === 'DRAFT' ? publishIssueMessages(deal, now) : [];

  return {
    ...toSummary(deal, brand),
    commissionBasePaise: deal.commissionBasePaise,
    commissionGstPaise: deal.commissionGstPaise,
    commissionTotalPaise: deal.commissionTotalPaise,
    advancePaise: deal.advancePaise,
    finalPaise: deal.finalPaise,
    confirmedAt: iso(deal.confirmedAt),
    cancelledAt: iso(deal.cancelledAt),
    cancelledByRole: deal.cancelledByRole,
    cancellationReason: deal.cancellationReason,
    commissionPaidAt: iso(deal.commissionPaidAt),
    advancePaidAt: iso(deal.advancePaidAt),
    approvedAt: iso(deal.approvedAt),
    completedAt: iso(deal.completedAt),
    contentLink: seesDelivery ? deal.contentLink : null,
    contentUploadedAt: iso(deal.contentUploadedAt),
    uploadCount: deal.uploadCount,
    revisionCount: deal.revisionCount,
    feedback: seesDelivery ? deal.feedback : null,
    contentUploads: uploads.map((u) => ({ link: u.link, uploadedAt: u.uploadedAt.toISOString() })),
    revisionNotice: deal.revisionCount >= 5 ? FIVE_REVISIONS_WARNING : null,
    creator,
    creatorPayoutStatus,
    applicationCount,
    applicationsOpen: open,
    contentOverdue: overdue,
    allowedActions: computeDealActions({
      status: deal.status,
      viewer: viewerKind,
      applicationsOpen: open,
      applicationCount: applicationCount ?? 0,
      hasApplied,
      payoutActive,
      creatorPayoutActive: creatorPayoutStatus === 'ACTIVE',
      uploadCount: deal.uploadCount,
      hasBilling,
      publishIssues,
    }),
  };
}
