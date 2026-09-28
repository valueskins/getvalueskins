import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import { AppError } from '../errors/AppError.js';
import type { Env } from '../env/index.js';
import type { InstagramProfile } from './client.js';

export interface InstagramLoginFields {
  profile: InstagramProfile;
  encryptedToken: string;
  tokenExpiresAt: Date;
  engagementRate: number | null;
  env: Env;
}

function isAdminId(instagramUserId: string, env: Env): boolean {
  return env.ADMIN_INSTAGRAM_USER_IDS.includes(instagramUserId);
}

/** Fields refreshed on every login/link, both directions (SPEC 6.1: "Profile
 * is refreshed on every login"; "Set is_admin from ADMIN_INSTAGRAM_USER_IDS"). */
function buildProfileFields(data: InstagramLoginFields) {
  const { profile, encryptedToken, tokenExpiresAt, engagementRate, env } = data;
  return {
    username: profile.username,
    name: profile.name ?? profile.username,
    igAccountType: profile.accountType,
    followersCount: profile.followersCount,
    followsCount: profile.followsCount,
    mediaCount: profile.mediaCount,
    engagementRate: engagementRate === null ? null : engagementRate.toFixed(2),
    bio: profile.biography,
    profilePictureUrl: profile.profilePictureUrl,
    igTokenEncrypted: encryptedToken,
    igTokenExpiresAt: tokenExpiresAt,
    instagramSyncedAt: new Date(),
    isAdmin: isAdminId(profile.userId, env),
  };
}

/** Upserts by instagram_user_id. role/roleLockedAt/onboardingCompletedAt are
 * only set (to their defaults) at insert time, never touched on update. */
export async function upsertInstagramLogin(data: InstagramLoginFields) {
  const fields = buildProfileFields(data);

  const [row] = await db
    .insert(users)
    .values({ instagramUserId: data.profile.userId, ...fields })
    .onConflictDoUpdate({ target: users.instagramUserId, set: fields })
    .returning();

  if (!row) throw new Error('upsertInstagramLogin: insert/update returned no row');
  return row;
}

export interface AttachInstagramInput extends InstagramLoginFields {
  userId: string;
}

/** Attaches an Instagram account to an already-logged-in user (link mode).
 * Throws if that Instagram account is already linked to a different user. */
export async function attachInstagramToUser(input: AttachInstagramInput) {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.instagramUserId, input.profile.userId))
    .limit(1);

  if (existing[0] && existing[0].id !== input.userId) {
    throw new AppError(
      'INSTAGRAM_ACCOUNT_ALREADY_LINKED',
      409,
      'This Instagram account is already linked to a different user',
    );
  }

  const fields = buildProfileFields(input);

  const [row] = await db
    .update(users)
    .set({ instagramUserId: input.profile.userId, ...fields })
    .where(eq(users.id, input.userId))
    .returning();

  if (!row) throw new Error('attachInstagramToUser: update returned no row');
  return row;
}
