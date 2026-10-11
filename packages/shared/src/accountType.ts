import type { UserRole } from './enums.js';

/** The Instagram account types ValueSkins accepts (REPLACEMENT_PLAN 2.3). */
export const ACCOUNT_TYPE_ROLES = {
  BUSINESS: 'BRAND',
  MEDIA_CREATOR: 'CREATOR',
} as const satisfies Record<string, UserRole>;

/**
 * Pure: the role for an Instagram `account_type`. A Business account is a brand and a
 * Creator account is a creator. Anything else, or nothing, is not accepted (null).
 */
export function roleFromAccountType(accountType: string | null | undefined): UserRole | null {
  // Meta's docs list the values as Business and Media_Creator; the API sends them in capitals.
  const type = accountType?.toUpperCase();
  if (type === 'BUSINESS') return ACCOUNT_TYPE_ROLES.BUSINESS;
  if (type === 'MEDIA_CREATOR') return ACCOUNT_TYPE_ROLES.MEDIA_CREATOR;
  return null;
}
