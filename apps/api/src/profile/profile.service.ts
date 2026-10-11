import {
  type BrandProfileInput,
  type CreatorProfileInput,
  type ProfileDetails,
  currentAge,
  CONNECT_INSTAGRAM_TO_CONTINUE,
  brandProfileSchema,
  creatorProfileSchema,
} from '@valueskins/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import { AppError } from '../errors/AppError.js';

type UserRow = typeof users.$inferSelect;

/** The locked profile for GET /api/me and the save response, or null until it is saved. The age is the current age. */
export function toProfileDetails(row: UserRow, now: Date): ProfileDetails | null {
  if (row.profileLockedAt === null || row.city === null) return null;
  return {
    name: row.name,
    city: row.city,
    age:
      row.age !== null && row.ageRecordedAt !== null
        ? currentAge(row.age, row.ageRecordedAt, now)
        : null,
    gender: row.gender,
    website: row.website,
    pitch: row.pitch,
    lockedAt: row.profileLockedAt.toISOString(),
  };
}

/** The 409 for a second save (REPLACEMENT_PLAN 2.4): corrections go to support by email. */
export function profileLockedError(supportEmail: string): AppError {
  return new AppError(
    'PROFILE_LOCKED',
    409,
    `Your profile is saved and cannot be changed here. Write to ${supportEmail} to correct it.`,
  );
}

/**
 * Saves the profile details once and locks them (REPLACEMENT_PLAN 2.4). The fields depend on the
 * caller's role, which comes from the session and never from the body. One conditional update,
 * so two racing saves cannot both win.
 */
export async function saveProfile(
  user: { id: string; role: 'BRAND' | 'CREATOR' | null },
  body: unknown,
  now: Date,
  supportEmail: string,
): Promise<ProfileDetails> {
  if (user.role === null) {
    throw new AppError('INSTAGRAM_NOT_CONNECTED', 403, CONNECT_INSTAGRAM_TO_CONTINUE);
  }

  const common = { profileLockedAt: now, adultConfirmedAt: now };
  let values: Partial<typeof users.$inferInsert>;
  if (user.role === 'CREATOR') {
    const input: CreatorProfileInput = creatorProfileSchema.parse(body);
    values = {
      ...common,
      name: input.name,
      city: input.city,
      age: input.age,
      ageRecordedAt: now,
      gender: input.gender,
    };
  } else {
    const input: BrandProfileInput = brandProfileSchema.parse(body);
    values = {
      ...common,
      name: input.name,
      city: input.city,
      website: input.website,
      pitch: input.pitch ?? null,
    };
  }

  const [row] = await db
    .update(users)
    .set(values)
    .where(and(eq(users.id, user.id), isNull(users.profileLockedAt)))
    .returning();
  if (!row) throw profileLockedError(supportEmail);

  const details = toProfileDetails(row, now);
  if (!details) throw new Error('saveProfile: saved profile has no details');
  return details;
}
