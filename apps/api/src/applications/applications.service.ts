import {
  APPLICATIONS_CLOSED,
  ALREADY_APPLIED_MESSAGE,
  ADD_UPI_TO_APPLY,
  CREATOR_PAYOUT_NOT_SET,
  applicationsOpen,
  type ApplicationItem,
  type ApplicationListQuery,
  type DealApplicationListResponse,
  type MyApplicationListResponse,
} from '@valueskins/shared';
import { and, desc, eq, inArray, lt, type SQL } from 'drizzle-orm';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/types.js';
import type { ApiContext } from '../context.js';
import { db } from '../db/client.js';
import { isUniqueViolation } from '../db/pgErrors.js';
import { applications, deals, users } from '../db/schema/index.js';
import { send } from '../email/send.js';
import { AppError } from '../errors/AppError.js';
import { consumeApplyLimit } from '../rateLimit/limiters.js';
import { findDeal, loadOwnedDeal, notFound, parseId } from '../deals/access.js';
import { decodeCursor, encodeCursor } from '../deals/cursor.js';
import { DELETED_USER_NAME, loadParties, toParty } from '../deals/dealView.js';
import { hasPayoutDetails } from '../deals/payoutDetails.js';
import { transitionDeal, type Deal, type AfterCommitTask } from '../deals/stateMachine.js';

type ApplicationRow = typeof applications.$inferSelect;

function toApplication(row: ApplicationRow): ApplicationItem {
  return {
    id: row.id,
    dealId: row.dealId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function alreadyApplied(): AppError {
  return new AppError('ALREADY_APPLIED', 409, ALREADY_APPLIED_MESSAGE);
}

function applicationsClosed(): AppError {
  return new AppError('APPLICATIONS_CLOSED', 409, APPLICATIONS_CLOSED);
}

/**
 * A creator applies to an OPEN deal (SPEC 5.5). Needs a saved UPI ID with consent
 * (REPLACEMENT_PLAN 2.1), open applications, and no earlier application. The insert runs
 * with the deal row locked FOR SHARE, so a confirm that is waiting for the same
 * row sees this application and rejects it: none is left APPLIED on a CONFIRMED deal.
 */
export async function applyToDeal(
  ctx: ApiContext,
  user: AuthenticatedUser,
  rawDealId: unknown,
  res: Response,
): Promise<ApplicationItem> {
  const dealId = parseId(rawDealId);
  const deal = await findDeal(dealId);
  // Only OPEN deals are visible to a creator who is not on them.
  if (!deal || deal.status !== 'OPEN') throw notFound();

  const [existing] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.dealId, dealId), eq(applications.creatorId, user.id)))
    .limit(1);
  if (existing) throw alreadyApplied();

  assertOpenForApplications(deal, ctx.now());
  if (!(await hasPayoutDetails(user.id))) {
    throw new AppError('PAYOUT_NOT_SET', 403, ADD_UPI_TO_APPLY);
  }

  await consumeApplyLimit(user.id, res);

  const created = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(deals)
      .where(eq(deals.id, dealId))
      .for('share')
      .limit(1);
    if (!locked || locked.status !== 'OPEN') throw notFound();
    assertOpenForApplications(locked, ctx.now());

    try {
      const [row] = await tx
        .insert(applications)
        .values({ dealId, creatorId: user.id })
        .returning();
      if (!row) throw new Error('application insert returned no row');
      return { application: row, deal: locked };
    } catch (error) {
      if (isUniqueViolation(error)) throw alreadyApplied();
      throw error;
    }
  });

  try {
    const [brand] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, created.deal.brandId))
      .limit(1);
    if (brand?.email) {
      await send(
        'NEW_APPLICATION',
        brand.email,
        {
          dealShortId: created.deal.shortId,
          dealTitle: created.deal.title ?? '',
          creatorUsername: user.username,
        },
        ctx.env,
        { dealId, userId: created.deal.brandId },
      );
    }
  } catch {
    // The application is saved; a failed notification never fails the request (SPEC 5.3).
  }

  return toApplication(created.application);
}

function assertOpenForApplications(deal: Deal, now: Date): void {
  if (
    !applicationsOpen(
      { status: deal.status, applicationDeadline: deal.applicationDeadline ?? '' },
      now,
    )
  ) {
    throw applicationsClosed();
  }
}

/**
 * The brand confirms one applicant (SPEC 5.2, 5.5). One transaction through
 * transitionDeal: the OPEN -> CONFIRMED update locks the deal, then the chosen
 * application is confirmed, every other APPLIED one rejected, and creator_id set.
 * Of two parallel confirms, the second finds the deal no longer OPEN and rolls
 * back whole. Allowed after the application deadline (SPEC 5.4).
 */
export async function confirmApplication(
  ctx: ApiContext,
  user: AuthenticatedUser,
  rawApplicationId: unknown,
): Promise<Deal> {
  const applicationId = parseId(rawApplicationId);
  const [found] = await db
    .select({ application: applications, deal: deals })
    .from(applications)
    .innerJoin(deals, eq(deals.id, applications.dealId))
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!found || found.deal.brandId !== user.id) throw notFound();
  if (found.application.status !== 'APPLIED') {
    throw new AppError('APPLICATION_NOT_PENDING', 409, 'This application was already decided');
  }

  const { application, deal } = found;
  const notifications: AfterCommitTask[] = [];

  return transitionDeal({
    dealId: deal.id,
    from: 'OPEN',
    to: 'CONFIRMED',
    actor: { role: 'BRAND', id: user.id },
    patch: { creatorId: application.creatorId, confirmedAt: ctx.now() },
    metadata: { applicationId },
    within: async (tx, updated) => {
      const [creator] = await tx
        .select({ email: users.email, deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.id, application.creatorId))
        .limit(1);
      if (!creator || creator.deletedAt) {
        throw new AppError('APPLICANT_UNAVAILABLE', 409, 'This creator is no longer available');
      }
      if (!(await hasPayoutDetails(application.creatorId, tx))) {
        throw new AppError('CREATOR_PAYOUT_NOT_SET', 409, CREATOR_PAYOUT_NOT_SET);
      }

      const [confirmed] = await tx
        .update(applications)
        .set({ status: 'CONFIRMED' })
        .where(and(eq(applications.id, applicationId), eq(applications.status, 'APPLIED')))
        .returning({ id: applications.id });
      if (!confirmed) {
        throw new AppError('APPLICATION_NOT_PENDING', 409, 'This application was already decided');
      }

      const rejected = await tx
        .update(applications)
        .set({ status: 'REJECTED' })
        .where(and(eq(applications.dealId, deal.id), eq(applications.status, 'APPLIED')))
        .returning({ creatorId: applications.creatorId });
      const rejectedRows =
        rejected.length === 0
          ? []
          : await tx
              .select({ id: users.id, email: users.email })
              .from(users)
              .where(
                inArray(
                  users.id,
                  rejected.map((r) => r.creatorId),
                ),
              );

      // Email 3 to the chosen creator, 3b to everyone else who applied (SPEC 8).
      const brandName = user.username;
      if (creator.email) {
        notifications.push(async () => {
          await send(
            'YOU_WERE_SELECTED',
            creator.email as string,
            {
              dealShortId: updated.shortId,
              dealTitle: updated.title ?? '',
              brandName,
            },
            ctx.env,
            { dealId: updated.id, userId: application.creatorId },
          );
        });
      }
      for (const other of rejectedRows) {
        if (!other.email) continue;
        const email = other.email;
        notifications.push(async () => {
          await send(
            'APPLICATION_NOT_SELECTED',
            email,
            { dealShortId: updated.shortId, dealTitle: updated.title ?? '' },
            ctx.env,
            { dealId: updated.id, userId: other.id },
          );
        });
      }
    },
    // `notifications` is filled inside the transaction and read after commit.
    afterCommit: [
      async (confirmedDeal) => {
        for (const notify of notifications) {
          try {
            await notify(confirmedDeal);
          } catch {
            // One failed email must not stop the rest.
          }
        }
      },
    ],
  });
}

/** The brand's view of who applied to one of its deals, newest first. */
export async function listDealApplications(
  user: AuthenticatedUser,
  rawDealId: unknown,
  query: ApplicationListQuery,
): Promise<DealApplicationListResponse> {
  const deal = await loadOwnedDeal(rawDealId, user.id);
  const conditions: SQL[] = [eq(applications.dealId, deal.id)];
  if (query.cursor) {
    conditions.push(lt(applications.id, decodeCursor(query.cursor, { needsTime: false }).i));
  }

  const rows = await db
    .select({
      application: applications,
      username: users.username,
      name: users.name,
      profilePictureUrl: users.profilePictureUrl,
      followersCount: users.followersCount,
      engagementRate: users.engagementRate,
      instagramUserId: users.instagramUserId,
      deletedAt: users.deletedAt,
    })
    .from(applications)
    .innerJoin(users, eq(users.id, applications.creatorId))
    .where(and(...conditions))
    .orderBy(desc(applications.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => {
      const party = toParty({
        id: row.application.creatorId,
        username: row.username,
        profilePictureUrl: row.profilePictureUrl,
        deletedAt: row.deletedAt,
      });
      const deleted = row.deletedAt !== null;
      return {
        ...toApplication(row.application),
        creator: {
          ...party,
          name: deleted ? DELETED_USER_NAME : row.name,
          followersCount: deleted ? null : row.followersCount,
          engagementRate:
            deleted || row.engagementRate === null ? null : Number(row.engagementRate),
          instagramVerified: !deleted && row.instagramUserId !== null,
        },
      };
    }),
    nextCursor: rows.length > query.limit && last ? encodeCursor({ i: last.application.id }) : null,
  };
}

/** A creator's own applications with a small summary of each deal, newest first. */
export async function listMyApplications(
  user: AuthenticatedUser,
  query: ApplicationListQuery,
): Promise<MyApplicationListResponse> {
  const conditions: SQL[] = [eq(applications.creatorId, user.id)];
  if (query.cursor) {
    conditions.push(lt(applications.id, decodeCursor(query.cursor, { needsTime: false }).i));
  }

  const rows = await db
    .select({ application: applications, deal: deals })
    .from(applications)
    .innerJoin(deals, eq(deals.id, applications.dealId))
    .where(and(...conditions))
    .orderBy(desc(applications.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  const parties = await loadParties(page.map((row) => row.deal.brandId));
  return {
    items: page.flatMap((row) => {
      const brand = parties.get(row.deal.brandId);
      if (!brand) return [];
      return [
        {
          ...toApplication(row.application),
          deal: {
            id: row.deal.id,
            shortId: row.deal.shortId,
            status: row.deal.status,
            title: row.deal.title,
            budgetPaise: row.deal.budgetPaise,
            creatorAmountPaise: row.deal.creatorAmountPaise,
            applicationDeadline: row.deal.applicationDeadline,
            brand,
          },
        },
      ];
    }),
    nextCursor: rows.length > query.limit && last ? encodeCursor({ i: last.application.id }) : null,
  };
}
