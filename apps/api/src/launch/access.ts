import { isLaunchOpen } from '@valueskins/shared';
import type { Env } from '../env/index.js';

/** The viewer, or null for someone who is not signed in. Only `isAdmin` matters here. */
type Viewer = { isAdmin: boolean } | null | undefined;

export interface LaunchAccess {
  paymentsOpen: boolean;
  postingOpen: boolean;
}

type LaunchEnv = Pick<Env, 'PAYMENTS_MODE' | 'DEAL_POSTING_MODE'>;

/** PAYMENTS_MODE for this viewer (SPEC 19). `admins` means ADMIN_INSTAGRAM_USER_IDS, via `users.is_admin`. */
export function paymentsOpenFor(env: LaunchEnv, viewer: Viewer): boolean {
  return isLaunchOpen(env.PAYMENTS_MODE, viewer?.isAdmin === true);
}

/** DEAL_POSTING_MODE for this viewer (SPEC 19). */
export function postingOpenFor(env: LaunchEnv, viewer: Viewer): boolean {
  return isLaunchOpen(env.DEAL_POSTING_MODE, viewer?.isAdmin === true);
}

export function launchAccessFor(env: LaunchEnv, viewer: Viewer): LaunchAccess {
  return { paymentsOpen: paymentsOpenFor(env, viewer), postingOpen: postingOpenFor(env, viewer) };
}
