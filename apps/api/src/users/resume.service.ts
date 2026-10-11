import type { ResumeResponse } from '@valueskins/shared';
import { currentAge } from '@valueskins/shared';
import { and, count, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deals, users } from '../db/schema/index.js';
import { notFound, parseId } from '../deals/access.js';
import { DELETED_USER_NAME, loadParties } from '../deals/dealView.js';

const RESUME_DEAL_COUNT = 10;

/**
 * SPEC 11 and REPLACEMENT_PLAN 2.5. The same body for every signed-in viewer. An
 * email-only account has no fetched profile: its typed username is returned with
 * instagramVerified false and the Instagram fields null.
 */
export async function loadResume(rawUserId: unknown, now: Date): Promise<ResumeResponse> {
  const userId = parseId(rawUserId);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.deletedAt || !user.role) throw notFound();

  const completed = await db
    .select()
    .from(deals)
    .where(
      and(
        eq(deals.status, 'COMPLETED'),
        or(eq(deals.brandId, userId), eq(deals.creatorId, userId)),
      ),
    )
    .orderBy(desc(deals.completedAt), desc(deals.id))
    .limit(RESUME_DEAL_COUNT);

  // Across every completed deal, not only the 10 listed.
  const [totals] = await db
    .select({
      completedDealsCount: count(),
      totalValuePaise: sql<string>`coalesce(sum(${deals.budgetPaise}), 0)`,
    })
    .from(deals)
    .where(
      and(
        eq(deals.status, 'COMPLETED'),
        or(eq(deals.brandId, userId), eq(deals.creatorId, userId)),
      ),
    );

  const counterpartyOf = (deal: (typeof completed)[number]) =>
    deal.brandId === userId ? deal.creatorId : deal.brandId;
  const parties = await loadParties(
    completed.flatMap((deal) => {
      const id = counterpartyOf(deal);
      return id ? [id] : [];
    }),
  );

  const verified = user.instagramUserId !== null;
  return {
    user: {
      id: user.id,
      role: user.role,
      username: user.username,
      name: user.name,
      profilePictureUrl: user.profilePictureUrl,
      instagramVerified: verified,
      igAccountType: user.igAccountType,
      followersCount: user.followersCount,
      engagementRate: user.engagementRate === null ? null : Number(user.engagementRate),
      // The profile is saved once and locked; the name above is the locked one after that.
      city: user.profileLockedAt ? user.city : null,
      age:
        user.profileLockedAt && user.age !== null && user.ageRecordedAt !== null
          ? currentAge(user.age, user.ageRecordedAt, now)
          : null,
      gender: user.profileLockedAt ? user.gender : null,
      website: user.profileLockedAt ? user.website : null,
      pitch: user.profileLockedAt ? user.pitch : null,
      // No chat on ValueSkins, so the two sides write to each other (REPLACEMENT_PLAN 2.5).
      contactEmail: user.emailVerifiedAt ? user.email : null,
      memberSince: user.createdAt.toISOString(),
    },
    stats: {
      completedDealsCount: totals?.completedDealsCount ?? 0,
      totalValuePaise: Number(totals?.totalValuePaise ?? 0),
    },
    completedDeals: completed.flatMap((deal) => {
      const counterpartyId = counterpartyOf(deal);
      if (!counterpartyId || deal.budgetPaise === null) return [];
      const party = parties.get(counterpartyId);
      return [
        {
          counterparty: {
            id: counterpartyId,
            username: party?.username ?? DELETED_USER_NAME,
          },
          budgetPaise: deal.budgetPaise,
          title: deal.title ?? '',
          completedAt: (deal.completedAt ?? deal.updatedAt).toISOString(),
        },
      ];
    }),
  };
}
