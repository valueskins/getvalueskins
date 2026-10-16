/**
 * Launch gates (SPEC 19): PAYMENTS_MODE and DEAL_POSTING_MODE each take one of these values.
 * `admins` means only users listed in ADMIN_INSTAGRAM_USER_IDS.
 */
export const LAUNCH_MODES = ['off', 'admins', 'on'] as const;

export type LaunchMode = (typeof LAUNCH_MODES)[number];

/** Whether a gate in `mode` is open for a user. Anonymous callers are not admins. */
export function isLaunchOpen(mode: LaunchMode, isAdmin: boolean): boolean {
  if (mode === 'on') return true;
  if (mode === 'admins') return isAdmin;
  return false;
}
