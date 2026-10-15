// NEXT_PUBLIC_ values are inlined at build time, so each one is read through a
// literal `process.env.NEXT_PUBLIC_X` reference.

const PRODUCTION_API_HOST = 'api.valueskins.com';

function hostOf(url: string | undefined): string {
  try {
    return new URL(url ?? '').host;
  } catch {
    // An unset or invalid API URL cannot be the production API.
    return '';
  }
}

/**
 * Mirrors the API's startup guard for the web build: `next build` always runs
 * with NODE_ENV=production, so the API's NODE_ENV rule cannot be reused. The
 * dev login page must never ship in a build that points at the production API.
 * Throws so `next build` fails.
 */
export function assertSafeWebEnv(env: Record<string, string | undefined>): void {
  if (env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== 'true') return;

  if (hostOf(env.NEXT_PUBLIC_API_URL) === PRODUCTION_API_HOST) {
    throw new Error(
      `NEXT_PUBLIC_ENABLE_DEV_LOGIN must not be "true" when NEXT_PUBLIC_API_URL points at ${PRODUCTION_API_HOST}`,
    );
  }
}

/** Base URL of the API, without a trailing slash. */
export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
}

/** /dev/login exists only when this is the literal string "true" (see assertSafeWebEnv). */
export function isDevLoginEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === 'true';
}

/** True for a build that talks to the production API. Review-only content is left out of it. */
export function isProductionTarget(): boolean {
  return hostOf(process.env.NEXT_PUBLIC_API_URL) === PRODUCTION_API_HOST;
}
