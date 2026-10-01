const PRODUCTION_API_HOST = 'api.valueskins.com';

/**
 * Mirrors the API's startup guard for the web build: `next build` always runs
 * with NODE_ENV=production, so the API's NODE_ENV rule cannot be reused. The
 * dev login page must never ship in a build that points at the production API.
 * Throws so `next build` fails.
 */
export function assertSafeWebEnv(env: Record<string, string | undefined>): void {
  if (env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== 'true') return;

  let host = '';
  try {
    host = new URL(env.NEXT_PUBLIC_API_URL ?? '').host;
  } catch {
    // An unset or invalid API URL cannot be the production API.
  }

  if (host === PRODUCTION_API_HOST) {
    throw new Error(
      `NEXT_PUBLIC_ENABLE_DEV_LOGIN must not be "true" when NEXT_PUBLIC_API_URL points at ${PRODUCTION_API_HOST}`,
    );
  }
}
