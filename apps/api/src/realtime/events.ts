import {
  FEED_ROOM,
  REALTIME_EVENTS,
  applicationNewPayloadSchema,
  dealNewPayloadSchema,
  dealRoom,
  dealStatusPayloadSchema,
  userRoom,
  type DealStatus,
} from '@valueskins/shared';
import { loadParties } from '../deals/dealView.js';
import type { Deal } from '../deals/stateMachine.js';
import { logger } from '../logging/logger.js';
import { captureError } from '../observability/sentry.js';
import { getRealtime } from './emitter.js';

/** What every emit does on failure: log the id and the kind of error, and carry on. An emit never fails a request. */
function failed(what: string, dealId: string | null, error: unknown): void {
  logger.error(
    { dealId, error: error instanceof Error ? error.message : 'unknown' },
    `realtime ${what} failed`,
  );
  captureError(error, `realtime ${what}`);
}

/** `deal:updated` to everyone in the deal's room (SPEC 10). Only the id and the status travel. */
export function emitDealUpdated(deal: { id: string; status: DealStatus }): void {
  try {
    const payload = dealStatusPayloadSchema.parse({ id: deal.id, status: deal.status });
    getRealtime().emit(dealRoom(deal.id), REALTIME_EVENTS.DEAL_UPDATED, payload);
  } catch (error) {
    failed('deal:updated', deal.id, error);
  }
}

/** The deal fields `deal:summary` needs: who its two parties are. */
type DealParties = { id: string; status: DealStatus; brandId: string; creatorId: string | null };

/**
 * `deal:summary` to the brand's and the confirmed creator's own rooms (SPEC 10), so their lists
 * (Campaigns, My deals, Applications) re-read without joining every deal's room. Only the id and the
 * status travel, as in `deal:updated`.
 */
export function emitDealSummary(deal: DealParties): void {
  try {
    const payload = dealStatusPayloadSchema.parse({ id: deal.id, status: deal.status });
    const rooms = deal.creatorId ? [deal.brandId, deal.creatorId] : [deal.brandId];
    for (const userId of rooms) {
      getRealtime().emit(userRoom(userId), REALTIME_EVENTS.DEAL_SUMMARY, payload);
    }
  } catch (error) {
    failed('deal:summary', deal.id, error);
  }
}

/**
 * A change on the deal that is not a status change (a direct payment recorded or marked not
 * received, a fee kept on a changed deal): `deal:updated` to its room and `deal:summary` to its two
 * parties.
 */
export function emitDealChanged(deal: DealParties): void {
  emitDealUpdated(deal);
  emitDealSummary(deal);
}

/** `deal:new` to the creators' feed, built from an explicit allowlist and never from the whole row. */
async function emitDealNew(deal: Deal): Promise<void> {
  const brand = (await loadParties([deal.brandId])).get(deal.brandId);
  if (!brand) throw new Error('the brand of a published deal does not exist');
  const payload = dealNewPayloadSchema.parse({
    id: deal.id,
    title: deal.title,
    brand: { username: brand.username, profilePictureUrl: brand.profilePictureUrl },
    budgetPaise: deal.budgetPaise,
    creatorAmountPaise: deal.creatorAmountPaise,
    applicationDeadline: deal.applicationDeadline,
    contentUploadDeadline: deal.contentUploadDeadline,
  });
  getRealtime().emit(FEED_ROOM, REALTIME_EVENTS.DEAL_NEW, payload);
}

/**
 * Called once per committed transition, from `transitionDeal` (SPEC 10): `deal:updated` to the
 * deal's room and `deal:summary` to its parties always, `deal:new` when a draft is published, and `deal:closed` when a deal leaves
 * OPEN (confirmed or cancelled), so it drops out of creators' feeds. Each emit is isolated, so one
 * failing does not stop the others.
 */
export async function emitDealTransition(input: {
  from: DealStatus;
  to: DealStatus;
  deal: Deal;
}): Promise<void> {
  const { from, to, deal } = input;
  emitDealUpdated(deal);
  emitDealSummary(deal);

  if (from === 'DRAFT' && to === 'OPEN') {
    try {
      await emitDealNew(deal);
    } catch (error) {
      failed('deal:new', deal.id, error);
    }
  }

  if (from === 'OPEN') {
    try {
      const payload = dealStatusPayloadSchema.parse({ id: deal.id, status: deal.status });
      getRealtime().emit(FEED_ROOM, REALTIME_EVENTS.DEAL_CLOSED, payload);
    } catch (error) {
      failed('deal:closed', deal.id, error);
    }
  }
}

/** `application:new` to the brand's own room. Only ids: the brand refetches the applications. */
export function emitApplicationNew(input: {
  brandId: string;
  dealId: string;
  applicationId: string;
}): void {
  try {
    const payload = applicationNewPayloadSchema.parse({
      dealId: input.dealId,
      applicationId: input.applicationId,
    });
    getRealtime().emit(userRoom(input.brandId), REALTIME_EVENTS.APPLICATION_NEW, payload);
  } catch (error) {
    failed('application:new', input.dealId, error);
  }
}
