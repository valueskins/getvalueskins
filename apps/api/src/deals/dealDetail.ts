import {
  DOCUMENT_SLUG_BY_INVOICE_KIND,
  FIVE_REVISIONS_WARNING,
  applicationsOpen,
  computeDealActions,
  contentOverdue,
  dueStageFor,
  validateDealForPublish,
  type DealDetail,
} from '@valueskins/shared';
import { and, asc, count, eq } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/types.js';
import { db } from '../db/client.js';
import type { Env } from '../env/index.js';
import { launchAccessFor } from '../launch/access.js';
import {
  applications,
  brandBilling,
  contentUploads,
  dealEvents,
  disputes,
  invoices,
} from '../db/schema/index.js';
import { iso, loadParties, toSummary } from './dealView.js';
import { listDirectPaymentRows, toDirectPaymentView } from '../directPayments/view.js';
import { hasPayoutDetails, loadPayoutStatuses } from './payoutDetails.js';
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

/** The deal's invoices and payment records, oldest first, then the deal record once the deal is completed. */
async function listDocuments(deal: Deal): Promise<DealDetail['documents']> {
  const rows = await db
    .select({ kind: invoices.kind, number: invoices.number, issuedAt: invoices.issuedAt })
    .from(invoices)
    .where(eq(invoices.dealId, deal.id))
    .orderBy(asc(invoices.issuedAt), asc(invoices.id));
  const list: DealDetail['documents'] = rows.map((row) => ({
    kind: DOCUMENT_SLUG_BY_INVOICE_KIND[row.kind],
    number: row.number,
    issuedAt: row.issuedAt.toISOString(),
  }));
  // The deal record is rendered on demand and has no number; it exists once the deal is completed.
  if (deal.status === 'COMPLETED') {
    list.push({
      kind: 'adp',
      number: null,
      issuedAt: (deal.completedAt ?? deal.updatedAt).toISOString(),
    });
  }
  return list;
}

/** The deal's disputes, oldest first: what each is about and where it stands, never the text or the resolution. */
async function listDealDisputes(deal: Deal): Promise<DealDetail['disputes']> {
  const rows = await db
    .select({
      id: disputes.id,
      subject: disputes.subject,
      status: disputes.status,
      raisedById: disputes.raisedById,
      createdAt: disputes.createdAt,
      resolvedAt: disputes.resolvedAt,
    })
    .from(disputes)
    .where(eq(disputes.dealId, deal.id))
    .orderBy(asc(disputes.createdAt), asc(disputes.id));
  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    status: row.status,
    // Only the deal's brand or its confirmed creator can raise a dispute.
    raisedByRole: row.raisedById === deal.brandId ? ('BRAND' as const) : ('CREATOR' as const),
    createdAt: row.createdAt.toISOString(),
    resolvedAt: iso(row.resolvedAt),
  }));
}

/**
 * Every round of changes the brand asked for, oldest first: each move from CONTENT_UPLOADED to
 * REVISION_REQUESTED carries the feedback in its note (review.service.ts).
 */
async function listFeedbackHistory(dealId: string): Promise<DealDetail['feedbackHistory']> {
  const rows = await db
    .select({ note: dealEvents.note, createdAt: dealEvents.createdAt })
    .from(dealEvents)
    .where(
      and(
        eq(dealEvents.dealId, dealId),
        eq(dealEvents.fromStatus, 'CONTENT_UPLOADED'),
        eq(dealEvents.toStatus, 'REVISION_REQUESTED'),
      ),
    )
    .orderBy(asc(dealEvents.createdAt), asc(dealEvents.id));
  return rows.flatMap((r) => (r.note ? [{ feedback: r.note, at: r.createdAt.toISOString() }] : []));
}

/** The GET /deals/:id body for a viewer who is allowed to see the deal (SPEC 16). */
export async function buildDealDetail(
  deal: Deal,
  viewer: AuthenticatedUser,
  now: Date,
  env: Pick<Env, 'PAYMENTS_MODE' | 'DEAL_POSTING_MODE'>,
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

  // Only the status leaves payoutDetails (never the UPI ID): it picks which reason the brand sees.
  const creatorPayout =
    privileged && deal.creatorId
      ? ((await loadPayoutStatuses([deal.creatorId])).get(deal.creatorId) ?? null)
      : null;
  const creatorPayoutSet = privileged && deal.creatorId ? creatorPayout === 'SET' : null;

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

  // `applied` is for a creator looking at the deal; brands and admins get null.
  let applied: boolean | null = null;
  if (viewer.role === 'CREATOR') {
    const [existing] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.dealId, deal.id), eq(applications.creatorId, viewer.id)))
      .limit(1);
    // The confirmed creator was picked from the applicants, so they have applied.
    applied = existing !== undefined || isConfirmedCreator;
  }
  const hasApplied = applied === true;
  const payoutSet =
    viewerKind === 'CREATOR' && deal.status === 'OPEN' ? await hasPayoutDetails(viewer.id) : false;
  const feedbackHistory = seesDelivery ? await listFeedbackHistory(deal.id) : [];

  // The direct UPI payment records (REPLACEMENT_PLAN 2.1), masked. A record that awaits the
  // creator's confirmation for the stage that is due drives PAY_* and CONFIRM_PAYMENT_RECEIVED.
  const records = seesDelivery
    ? (await listDirectPaymentRows(deal.id)).map(toDirectPaymentView)
    : [];
  const dueStage = dueStageFor(deal.status);
  const pendingRecord = records.some(
    (r) => r.stage === dueStage && r.status === 'AWAITING_CONFIRMATION',
  );

  // Documents and disputes belong to the two parties and admins, like the delivery history.
  const documents = seesDelivery ? await listDocuments(deal) : [];
  const dealDisputes = seesDelivery ? await listDealDisputes(deal) : [];

  const hasBilling = viewerKind === 'BRAND_OWNER' ? await hasBillingDetails(viewer.id) : false;
  const publishIssues =
    viewerKind === 'BRAND_OWNER' && deal.status === 'DRAFT' ? publishIssueMessages(deal, now) : [];

  return {
    ...toSummary(deal, brand),
    commissionBasePaise: deal.commissionBasePaise,
    commissionGstPaise: deal.commissionGstPaise,
    commissionTotalPaise: deal.commissionTotalPaise,
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
    feedbackHistory,
    contentUploads: uploads.map((u) => ({ link: u.link, uploadedAt: u.uploadedAt.toISOString() })),
    revisionNotice: deal.revisionCount >= 5 ? FIVE_REVISIONS_WARNING : null,
    creator,
    creatorPayoutSet,
    directPayments: records,
    documents,
    disputes: dealDisputes,
    applicationCount,
    applicationsOpen: open,
    contentOverdue: overdue,
    applied,
    allowedActions: computeDealActions({
      status: deal.status,
      viewer: viewerKind,
      applicationsOpen: open,
      applicationCount: applicationCount ?? 0,
      hasApplied,
      payoutSet,
      uploadCount: deal.uploadCount,
      hasCreator: deal.creatorId !== null,
      creatorPayout,
      hasOpenDispute: dealDisputes.some((d) => d.status === 'OPEN'),
      pendingRecord,
      hasBilling,
      publishIssues,
      ...launchAccessFor(env, viewer),
    }),
  };
}
