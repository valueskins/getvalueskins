import type { MeResponse, UserRole } from '@valueskins/shared';

/**
 * Who may open a page:
 * - `public`: anyone. A signed-in user is sent on only from the home page.
 * - `setup`: signed in, onboarding in any state (onboarding, verify email).
 * - `app`: signed in and onboarded, any role (settings).
 * - a role: signed in, onboarded, and that role. Anyone else gets a 404.
 */
export type Need = 'public' | 'home' | 'setup' | 'app' | UserRole;

export type Access = { kind: 'ok' } | { kind: 'redirect'; to: string } | { kind: 'notFound' };

const OK: Access = { kind: 'ok' };

/** Where a signed-in user starts. */
export function homePathFor(me: MeResponse): string {
  if (!isOnboarded(me)) return '/onboarding';
  return me.user.role === 'BRAND' ? '/campaigns' : '/deals';
}

/** Onboarded means a role and every required step done. A creator's UPI step is optional. */
export function isOnboarded(me: MeResponse): boolean {
  return me.user.role !== null && me.onboarding.completed;
}

/**
 * The decision for one page, from GET /me (null when signed out). Permissions
 * themselves are the API's job; this only keeps people on pages that make sense
 * for them, and hides pages of the other role behind a 404.
 */
export function decideAccess(me: MeResponse | null, need: Need): Access {
  if (need === 'public') return OK;
  if (need === 'home') return me ? { kind: 'redirect', to: homePathFor(me) } : OK;

  if (!me) return { kind: 'redirect', to: '/' };
  if (need === 'setup') return OK;

  if (!isOnboarded(me)) return { kind: 'redirect', to: '/onboarding' };
  if (need === 'app') return OK;

  return me.user.role === need ? OK : { kind: 'notFound' };
}
