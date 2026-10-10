import {
  ADD_BILLING_TO_PUBLISH,
  CANCELLATION_NOT_POSSIBLE_AFTER_ADVANCE,
  computeBreakdown,
  validateDealForPublish,
  type DealStatus,
} from '@valueskins/shared';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/types.js';
import type { ApiContext } from '../context.js';
import { emailOf } from '../email/recipients.js';
import { send } from '../email/send.js';
import { AppError } from '../errors/AppError.js';
import { consumePublishDealLimit } from '../rateLimit/limiters.js';
import { loadOwnedDeal } from './access.js';
import { hasBillingDetails } from './dealDetail.js';
import { transitionDeal, type AfterCommitTask, type Deal, type DealPatch } from './stateMachine.js';

/** SPEC 5.2: the statuses a brand can cancel from. */
const CANCELLABLE: readonly DealStatus[] = ['OPEN', 'CONFIRMED', 'COMMISSION_PAID'];
const POST_ADVANCE: readonly DealStatus[] = [
  'ADVANCE_PAID',
  'CONTENT_UPLOADED',
  'REVISION_REQUESTED',
  'APPROVED',
];

function assertPublishable(deal: Deal, now: Date): void {
  const issues = validateDealForPublish(
    {
      title: deal.title,
      description: deal.description,
      budgetPaise: deal.budgetPaise,
      applicationDeadline: deal.applicationDeadline,
      contentUploadDeadline: deal.contentUploadDeadline,
      dealDeadline: deal.dealDeadline,
    },
    now,
  );
  if (issues.length > 0) {
    throw new AppError('VALIDATION_ERROR', 400, 'This deal is not ready to publish', issues);
  }
}

/**
 * DRAFT -> OPEN (SPEC 5.2, 5.4). The breakdown is computed here, once, with the
 * live GST rate, and frozen on the row (SPEC 4.1). The draft is validated again
 * under the row lock, so an edit racing the publish cannot slip past.
 */
export async function publishDeal(
  ctx: ApiContext,
  user: AuthenticatedUser,
  rawId: unknown,
  res: Response,
): Promise<Deal> {
  const now = ctx.now();
  const deal = await loadOwnedDeal(rawId, user.id);
  if (deal.status !== 'DRAFT') {
    throw new AppError('DEAL_NOT_DRAFT', 409, 'Only a draft can be published');
  }
  if (!(await hasBillingDetails(user.id))) {
    throw new AppError('BILLING_REQUIRED', 409, ADD_BILLING_TO_PUBLISH);
  }
  assertPublishable(deal, now);

  await consumePublishDealLimit(user.id, res);

  return transitionDeal({
    dealId: deal.id,
    from: 'DRAFT',
    to: 'OPEN',
    actor: { role: 'BRAND', id: user.id },
    prepare: async (_tx, current): Promise<DealPatch> => {
      assertPublishable(current, now);
      const breakdown = computeBreakdown(current.budgetPaise as number, ctx.env.GST_RATE_BPS);
      return {
        commissionBasePaise: breakdown.commissionBasePaise,
        commissionGstPaise: breakdown.commissionGstPaise,
        commissionTotalPaise: breakdown.commissionTotalPaise,
        creatorAmountPaise: breakdown.creatorAmountPaise,
        advancePaise: breakdown.advancePaise,
        finalPaise: breakdown.finalPaise,
        publishedAt: now,
      };
    },
    afterCommit: [
      async (published) => {
        if (!user.email) return;
        await send(
          'DEAL_PUBLISHED',
          user.email,
          {
            dealShortId: published.shortId,
            dealTitle: published.title ?? '',
            applicationDeadline: published.applicationDeadline ?? '',
          },
          ctx.env,
          { dealId: published.id, userId: user.id },
        );
      },
    ],
  });
}

function assertCancellable(status: DealStatus): void {
  if (CANCELLABLE.includes(status)) return;
  if (POST_ADVANCE.includes(status)) {
    throw new AppError('CANCELLATION_NOT_POSSIBLE', 409, CANCELLATION_NOT_POSSIBLE_AFTER_ADVANCE);
  }
  if (status === 'DRAFT') {
    throw new AppError(
      'INVALID_TRANSITION',
      409,
      'A draft cannot be cancelled. Delete it instead.',
    );
  }
  throw new AppError(
    'INVALID_TRANSITION',
    409,
    `A ${status.toLowerCase()} deal cannot be cancelled`,
  );
}

/**
 * Email 11 to the brand and, when one was confirmed, the creator (SPEC 8). Shared by the
 * brand's cancel and the admin override; a party with no email address is skipped.
 */
export function cancellationEmailTasks(
  ctx: ApiContext,
  reason: string,
  commissionKept: boolean,
): AfterCommitTask[] {
  const sendTo = async (cancelled: Deal, partyId: string): Promise<void> => {
    const to = await emailOf(partyId);
    if (!to) return;
    await send(
      'DEAL_CANCELLED',
      to,
      {
        dealShortId: cancelled.shortId,
        dealTitle: cancelled.title ?? '',
        reason,
        commissionKept,
      },
      ctx.env,
      { dealId: cancelled.id, userId: partyId },
    );
  };
  return [
    async (cancelled) => sendTo(cancelled, cancelled.brandId),
    async (cancelled) => {
      if (cancelled.creatorId) await sendTo(cancelled, cancelled.creatorId);
    },
  ];
}

/** Brand cancels from OPEN, CONFIRMED or COMMISSION_PAID (SPEC 5.2); email 11 to the brand and a confirmed creator. */
export async function cancelDeal(
  ctx: ApiContext,
  user: AuthenticatedUser,
  rawId: unknown,
  reason: string,
): Promise<Deal> {
  const deal = await loadOwnedDeal(rawId, user.id);
  assertCancellable(deal.status);
  const commissionKept = deal.status === 'COMMISSION_PAID';

  return transitionDeal({
    dealId: deal.id,
    from: deal.status,
    to: 'CANCELLED',
    actor: { role: 'BRAND', id: user.id },
    patch: {
      cancelledAt: ctx.now(),
      cancelledById: user.id,
      cancelledByRole: 'BRAND',
      cancellationReason: reason,
    },
    note: reason,
    afterCommit: cancellationEmailTasks(ctx, reason, commissionKept),
  });
}
