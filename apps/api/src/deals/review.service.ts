import {
  APPROVAL_NOT_POSSIBLE_NOW,
  CONTENT_CANNOT_BE_SHARED_NOW,
  FEEDBACK_NOT_POSSIBLE_NOW,
  MAX_CONTENT_UPLOADS_PER_DEAL,
  UPLOAD_LIMIT_REACHED,
} from '@valueskins/shared';
import type { AuthenticatedUser } from '../auth/types.js';
import type { ApiContext } from '../context.js';
import { contentUploads } from '../db/schema/index.js';
import { emailOf } from '../email/recipients.js';
import { send } from '../email/send.js';
import { AppError } from '../errors/AppError.js';
import { findDeal, loadOwnedDeal, notFound, parseId } from './access.js';
import { transitionDeal, type Deal } from './stateMachine.js';

/** The deal is not where this action needs it. The message says when it is possible, never a status. */
function wrongStatus(message: string): AppError {
  return new AppError('WRONG_DEAL_STATUS', 409, message);
}

/**
 * POST /deals/:id/content (SPEC 5.5 phase 6): the confirmed creator pastes a Drive link,
 * from ADVANCE_PAID or REVISION_REQUESTED. Every link is kept in content_uploads, so a
 * re-upload never erases the history. At most 20 per deal (SPEC 13). Email 6 to the brand.
 */
export async function uploadContent(
  ctx: ApiContext,
  user: AuthenticatedUser,
  rawId: unknown,
  link: string,
): Promise<Deal> {
  const deal = await findDeal(parseId(rawId));
  if (!deal || deal.creatorId !== user.id) throw notFound();
  if (deal.status !== 'ADVANCE_PAID' && deal.status !== 'REVISION_REQUESTED') {
    throw wrongStatus(CONTENT_CANNOT_BE_SHARED_NOW);
  }
  const now = ctx.now();

  return transitionDeal({
    dealId: deal.id,
    from: deal.status,
    to: 'CONTENT_UPLOADED',
    actor: { role: 'CREATOR', id: user.id },
    prepare: async (_tx, current) => {
      if (current.uploadCount >= MAX_CONTENT_UPLOADS_PER_DEAL) {
        throw new AppError('UPLOAD_LIMIT_REACHED', 429, UPLOAD_LIMIT_REACHED);
      }
      return { contentLink: link, contentUploadedAt: now, uploadCount: current.uploadCount + 1 };
    },
    within: async (tx, updated) => {
      await tx.insert(contentUploads).values({ dealId: updated.id, link, uploadedAt: now });
    },
    afterCommit: [
      async (uploaded) => {
        const to = await emailOf(uploaded.brandId);
        if (!to) return;
        await send(
          'CONTENT_UPLOADED',
          to,
          { dealShortId: uploaded.shortId, dealTitle: uploaded.title ?? '', contentLink: link },
          ctx.env,
          { dealId: uploaded.id, userId: uploaded.brandId },
        );
      },
    ],
  });
}

/**
 * POST /deals/:id/feedback (phase 7): the brand asks for changes on uploaded content. The
 * text is the deal event's note (that is where each round's feedback and time are kept for
 * the deal report); the deal row holds the latest. Email 7 to the creator.
 */
export async function sendFeedback(
  ctx: ApiContext,
  user: AuthenticatedUser,
  rawId: unknown,
  feedback: string,
): Promise<Deal> {
  const deal = await loadOwnedDeal(rawId, user.id);
  if (deal.status !== 'CONTENT_UPLOADED') throw wrongStatus(FEEDBACK_NOT_POSSIBLE_NOW);

  return transitionDeal({
    dealId: deal.id,
    from: 'CONTENT_UPLOADED',
    to: 'REVISION_REQUESTED',
    actor: { role: 'BRAND', id: user.id },
    note: feedback,
    prepare: async (_tx, current) => ({ feedback, revisionCount: current.revisionCount + 1 }),
    afterCommit: [
      async (revised) => {
        if (!revised.creatorId) return;
        const to = await emailOf(revised.creatorId);
        if (!to) return;
        await send(
          'CHANGES_REQUESTED',
          to,
          { dealShortId: revised.shortId, dealTitle: revised.title ?? '', feedback },
          ctx.env,
          { dealId: revised.id, userId: revised.creatorId },
        );
      },
    ],
  });
}

/** POST /deals/:id/approve (phase 7): final approval. Email 8 to the creator: waiting for the final payment. */
export async function approveContent(
  ctx: ApiContext,
  user: AuthenticatedUser,
  rawId: unknown,
): Promise<Deal> {
  const deal = await loadOwnedDeal(rawId, user.id);
  if (deal.status !== 'CONTENT_UPLOADED') throw wrongStatus(APPROVAL_NOT_POSSIBLE_NOW);

  return transitionDeal({
    dealId: deal.id,
    from: 'CONTENT_UPLOADED',
    to: 'APPROVED',
    actor: { role: 'BRAND', id: user.id },
    patch: { approvedAt: ctx.now() },
    afterCommit: [
      async (approved) => {
        if (!approved.creatorId) return;
        const to = await emailOf(approved.creatorId);
        if (!to) return;
        await send(
          'CONTENT_APPROVED',
          to,
          { dealShortId: approved.shortId, dealTitle: approved.title ?? '' },
          ctx.env,
          { dealId: approved.id, userId: approved.creatorId },
        );
      },
    ],
  });
}
