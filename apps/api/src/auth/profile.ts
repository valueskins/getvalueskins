import type { MeProfile } from '@valueskins/shared';
import type { users } from '../db/schema/index.js';

/** The fetched Instagram profile for GET /api/me. Null when no Instagram
 * account is linked (an email-only account). Never includes the token. */
export function toMeProfile(row: typeof users.$inferSelect): MeProfile | null {
  if (row.instagramUserId === null) return null;

  return {
    username: row.username,
    name: row.name,
    profilePictureUrl: row.profilePictureUrl,
    followersCount: row.followersCount,
    followsCount: row.followsCount,
    mediaCount: row.mediaCount,
    engagementRate: row.engagementRate === null ? null : Number(row.engagementRate),
    instagramSyncedAt: row.instagramSyncedAt ? row.instagramSyncedAt.toISOString() : null,
    biography: row.bio,
    accountType: row.igAccountType,
  };
}
