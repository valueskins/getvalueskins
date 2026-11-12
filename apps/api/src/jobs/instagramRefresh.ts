import { and, asc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import {
  computeEngagementRate,
  fetchLatestMedia,
  fetchProfile,
  refreshLongLivedToken,
} from '../instagram/client.js';
import { InstagramApiError } from '../instagram/errors.js';
import { decryptInstagramToken, encryptInstagramToken } from '../instagram/tokenEncryption.js';
import { logger } from '../logging/logger.js';
import { clearInstagramToken } from '../meta/deauthorize.service.js';
import { DAY_MS } from './dailyOnce.js';
import type { JobContext, JobCounts, JobDefinition } from './types.js';

/** Users who used the app within this window are refreshed (SPEC 14). */
export const ACTIVE_WINDOW_MS = 30 * DAY_MS;
/** The long-lived token is renewed once fewer than this many days are left (SPEC 6.1). */
export const RENEW_BELOW_MS = 10 * DAY_MS;
/** A pause between users, so a run is a trickle and not a burst. */
export const PAUSE_BETWEEN_USERS_MS = 250;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The unique index on `username` rejected the handle (another linked account holds it). */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } })?.code;
  const causeCode = (error as { cause?: { code?: string } })?.cause?.code;
  return code === '23505' || causeCode === '23505';
}

/**
 * Daily at 08:15 India Standard Time, after the API wakes at 07:00: refresh the Instagram profile, followers,
 * engagement rate and the long-lived token of every user active in the last 30 days (SPEC 6.1, 14).
 *
 * It is a plain update of the Instagram fields. The role, the account type, the admin flag and
 * the profile details only change at sign-in (`resolveRole`), never here, and the name is left
 * alone once the profile is locked. Meta's limit is 4,800 calls x impressions per account per
 * 24 hours and this makes about three calls per user, so the job paces itself and stops the whole
 * run if Meta asks it to slow down; the users not reached, the least recently synced first, are
 * done the next day.
 */
export const instagramRefreshJob: JobDefinition = {
  name: 'instagram-refresh',
  schedule: '15 8 * * *',
  description:
    'Refresh profile, followers, engagement and the long-lived token for users active in 30 days',
  async run(ctx: JobContext): Promise<JobCounts> {
    const now = ctx.now();
    const sleep = ctx.sleep ?? defaultSleep;
    const rows = await db
      .select({
        id: users.id,
        instagramUserId: users.instagramUserId,
        encrypted: users.igTokenEncrypted,
        expiresAt: users.igTokenExpiresAt,
        profileLockedAt: users.profileLockedAt,
      })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          isNotNull(users.igTokenEncrypted),
          isNotNull(users.instagramUserId),
          gte(users.lastActiveAt, new Date(now.getTime() - ACTIVE_WINDOW_MS)),
        ),
      )
      .orderBy(sql`${users.instagramSyncedAt} asc nulls first`, asc(users.id));

    const counts: JobCounts = {
      selected: rows.length,
      refreshed: 0,
      renewed: 0,
      invalid: 0,
      skipped: 0,
      failed: 0,
      rateLimited: 0,
    };

    for (const [index, user] of rows.entries()) {
      if (index > 0) await sleep(PAUSE_BETWEEN_USERS_MS);
      if (!user.encrypted || !user.instagramUserId) continue;

      let accessToken: string;
      try {
        accessToken = decryptInstagramToken(user.encrypted, ctx.env);
      } catch {
        // Not a token this key made (a dev-login account): nothing to refresh.
        counts.skipped = (counts.skipped ?? 0) + 1;
        continue;
      }

      try {
        const needsRenewal =
          user.expiresAt === null || user.expiresAt.getTime() - now.getTime() < RENEW_BELOW_MS;
        if (needsRenewal) {
          const renewed = await refreshLongLivedToken(accessToken);
          accessToken = renewed.accessToken;
          // Saved at once: if the profile calls below fail, the new token is not lost.
          await db
            .update(users)
            .set({
              igTokenEncrypted: encryptInstagramToken(accessToken, ctx.env),
              igTokenExpiresAt: new Date(now.getTime() + renewed.expiresInSeconds * 1000),
            })
            .where(eq(users.id, user.id));
          counts.renewed = (counts.renewed ?? 0) + 1;
        }

        const profile = await fetchProfile(accessToken);
        const media = await fetchLatestMedia(accessToken);
        const engagementRate = computeEngagementRate(media, profile.followersCount);

        const fields = {
          ...(user.profileLockedAt ? {} : { name: profile.name ?? profile.username }),
          followersCount: profile.followersCount,
          followsCount: profile.followsCount,
          mediaCount: profile.mediaCount,
          engagementRate: engagementRate === null ? null : engagementRate.toFixed(2),
          bio: profile.biography,
          profilePictureUrl: profile.profilePictureUrl,
          instagramSyncedAt: now,
        };
        try {
          await db
            .update(users)
            .set({ username: profile.username, ...fields })
            .where(eq(users.id, user.id));
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          // Another linked account has this handle now: keep the old one, refresh the rest.
          await db.update(users).set(fields).where(eq(users.id, user.id));
        }
        counts.refreshed = (counts.refreshed ?? 0) + 1;
      } catch (error) {
        if (error instanceof InstagramApiError && error.isRateLimited) {
          counts.rateLimited = 1;
          break;
        }
        if (error instanceof InstagramApiError && error.isInvalidToken) {
          // The stored token is dead: clear it so it is not retried every day. The next sign-in mints a new one.
          await clearInstagramToken(user.instagramUserId);
          counts.invalid = (counts.invalid ?? 0) + 1;
          continue;
        }
        counts.failed = (counts.failed ?? 0) + 1;
        logger.warn(
          {
            job: 'instagram-refresh',
            userId: user.id,
            metaError: error instanceof InstagramApiError ? error.metaCode : undefined,
            httpStatus: error instanceof InstagramApiError ? error.httpStatus : undefined,
          },
          'instagram refresh failed for one user',
        );
      }
    }
    return counts;
  },
};
