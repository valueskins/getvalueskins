import { z } from 'zod';
import { USER_GENDERS } from '../enums.js';
import { meOnboardingSchema, profileDetailsSchema } from './me.js';

export const PROFILE_NAME_MIN = 2;
export const PROFILE_NAME_MAX = 100;
export const PROFILE_CITY_MAX = 100;
export const PROFILE_WEBSITE_MAX = 200;
export const PROFILE_PITCH_MAX = 1000;
export const PROFILE_AGE_MIN = 18;
export const PROFILE_AGE_MAX = 99;

export const INVALID_PROFILE_NAME =
  'Enter your name using letters, spaces, dots, hyphens and apostrophes.';
export const INVALID_PROFILE_CITY = 'Enter your city.';
export const INVALID_PROFILE_WEBSITE = 'Enter a website that starts with http:// or https://.';

/** Letters in any script, then letters, spaces and . ' - (the same shape as the UPI account name). */
const NAME_REGEX = /^\p{L}[\p{L}\p{M} .'’-]*$/u;

const nameSchema = z
  .string()
  .trim()
  .min(PROFILE_NAME_MIN, INVALID_PROFILE_NAME)
  .max(PROFILE_NAME_MAX, INVALID_PROFILE_NAME)
  .regex(NAME_REGEX, INVALID_PROFILE_NAME);

const citySchema = z
  .string()
  .trim()
  .min(PROFILE_NAME_MIN, INVALID_PROFILE_CITY)
  .max(PROFILE_CITY_MAX, INVALID_PROFILE_CITY);

const websiteSchema = z
  .string()
  .trim()
  .max(PROFILE_WEBSITE_MAX, INVALID_PROFILE_WEBSITE)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, INVALID_PROFILE_WEBSITE);

/** The "I am 18 or older" checkbox: it must be ticked to save. */
const adultConfirmedSchema = z.literal(true, { error: 'Confirm that you are 18 or older.' });

/** PUT /api/me/profile for a creator (REPLACEMENT_PLAN 2.4). Saved once, then locked. */
export const creatorProfileSchema = z
  .object({
    name: nameSchema,
    city: citySchema,
    age: z.number().int().min(PROFILE_AGE_MIN).max(PROFILE_AGE_MAX),
    gender: z.enum(USER_GENDERS),
    adultConfirmed: adultConfirmedSchema,
  })
  .strict();

/** PUT /api/me/profile for a brand (REPLACEMENT_PLAN 2.4). The hiring pitch is optional. */
export const brandProfileSchema = z
  .object({
    name: nameSchema,
    city: citySchema,
    website: websiteSchema,
    pitch: z
      .string()
      .trim()
      .max(PROFILE_PITCH_MAX, `The pitch can be up to ${PROFILE_PITCH_MAX} characters.`)
      .optional()
      .transform((value) => (value === undefined || value === '' ? undefined : value)),
    adultConfirmed: adultConfirmedSchema,
  })
  .strict();

export type CreatorProfileInput = z.infer<typeof creatorProfileSchema>;
export type BrandProfileInput = z.infer<typeof brandProfileSchema>;

/** PUT /api/me/profile: the locked details and the refreshed onboarding state. */
export const meProfileSaveResponseSchema = z.object({
  profileDetails: profileDetailsSchema,
  onboarding: meOnboardingSchema,
});

export type MeProfileSaveResponse = z.infer<typeof meProfileSaveResponseSchema>;
