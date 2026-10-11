import { eq } from 'drizzle-orm';
import { withTransaction } from '../db/client.js';
import { users } from '../db/schema/index.js';
import type { Env } from '../env/index.js';
import { AppError } from '../errors/AppError.js';
import type { InstagramProfile } from './client.js';
import { resolveRole } from './resolveRole.js';

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
 * is refreshed on every login"; "Set is_admin from ADMIN_INSTAGRAM_USER_IDS").
 * The name is the Instagram name only until the profile is locked: after that
 * it is the name the user gave (REPLACEMENT_PLAN 2.4). */
function buildProfileFields(data: InstagramLoginFields, nameLocked: boolean) {
  const { profile, encryptedToken, tokenExpiresAt, engagementRate, env } = data;
  return {
    username: profile.username,
    ...(nameLocked ? {} : { name: profile.name ?? profile.username }),
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

/** The profile details are for one role (a creator's age, a brand's website), so a role change starts them again. */
const PROFILE_RESET = {
  city: null,
  age: null,
  ageRecordedAt: null,
  gender: null,
  website: null,
  pitch: null,
  profileLockedAt: null,
  adultConfirmedAt: null,
} as const;

function roleFields(role: 'BRAND' | 'CREATOR', changed: boolean, hadRole: boolean) {
  if (!changed && hadRole) return {};
  return {
    role,
    roleLockedAt: new Date(),
    ...(changed ? PROFILE_RESET : {}),
  };
}

/**
 * Upserts by instagram_user_id. The role always comes from the Instagram account type
 * (REPLACEMENT_PLAN 2.3): a new account gets it at insert, a returning account follows a
 * changed type only while it has no deals or applications in its current role. The existing
 * row is locked for the check, so a deal cannot be created between the check and the change.
 * Throws ACCOUNT_TYPE_UNSUPPORTED or ACCOUNT_TYPE_CHANGE_BLOCKED.
 */
export async function upsertInstagramLogin(data: InstagramLoginFields) {
  return withTransaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id, role: users.role, profileLockedAt: users.profileLockedAt })
      .from(users)
      .where(eq(users.instagramUserId, data.profile.userId))
      .for('update')
      .limit(1);

    const resolution = await resolveRole(
      tx,
      existing ? { id: existing.id, role: existing.role } : null,
      data.profile.accountType,
      data.env.SUPPORT_EMAIL,
    );
    // A role change unlocks the profile, so the Instagram name may refresh again.
    const nameLocked = existing?.profileLockedAt != null && !resolution.changed;
    const fields = {
      ...buildProfileFields(data, nameLocked),
      ...roleFields(resolution.role, resolution.changed, existing?.role != null),
    };

    const [row] = await tx
      .insert(users)
      .values({
        instagramUserId: data.profile.userId,
        name: data.profile.name ?? data.profile.username,
        role: resolution.role,
        roleLockedAt: new Date(),
        ...fields,
      })
      .onConflictDoUpdate({ target: users.instagramUserId, set: fields })
      .returning();

    if (!row) throw new Error('upsertInstagramLogin: insert/update returned no row');
    return row;
  });
}

export interface AttachInstagramInput extends InstagramLoginFields {
  userId: string;
}

/** Attaches an Instagram account to an already-logged-in user (link mode), which also gives an
 * email-only account its role. Throws if that Instagram account is already linked to a different
 * user, and the same account type errors as a sign-in. */
export async function attachInstagramToUser(input: AttachInstagramInput) {
  return withTransaction(async (tx) => {
    const [owner] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.instagramUserId, input.profile.userId))
      .limit(1);

    if (owner && owner.id !== input.userId) {
      throw new AppError(
        'INSTAGRAM_ACCOUNT_ALREADY_LINKED',
        409,
        'This Instagram account is already linked to a different user',
      );
    }

    const [current] = await tx
      .select({ id: users.id, role: users.role, profileLockedAt: users.profileLockedAt })
      .from(users)
      .where(eq(users.id, input.userId))
      .for('update')
      .limit(1);
    if (!current) throw new Error('attachInstagramToUser: user not found');

    const resolution = await resolveRole(
      tx,
      { id: current.id, role: current.role },
      input.profile.accountType,
      input.env.SUPPORT_EMAIL,
    );
    const nameLocked = current.profileLockedAt != null && !resolution.changed;

    const [row] = await tx
      .update(users)
      .set({
        instagramUserId: input.profile.userId,
        ...buildProfileFields(input, nameLocked),
        ...roleFields(resolution.role, resolution.changed, current.role !== null),
      })
      .where(eq(users.id, input.userId))
      .returning();

    if (!row) throw new Error('attachInstagramToUser: update returned no row');
    return row;
  });
}
