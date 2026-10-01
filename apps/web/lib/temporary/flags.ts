// Temporary UI (isolated with app/(temporary)): the final design replaces it.
// NEXT_PUBLIC_ values are inlined at build time, so each one is read through a
// literal `process.env.NEXT_PUBLIC_X` reference.

/** Base URL of the API, without a trailing slash. */
export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
}

/** /dev/login exists only when this is the literal string "true" (see envGuard.ts). */
export function isDevLoginEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === 'true';
}

/** Shows "Sign in with email". Mirrors the API's AUTH_EMAIL_ENABLED. */
export function isEmailLoginEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_EMAIL_ENABLED === 'true';
}
