import * as Sentry from '@sentry/nextjs';
import { sentryDsn } from './lib/sentryDsn';
import { initSentry } from './lib/sentryInit';

export function register(): void {
  initSentry('server');
}

/** How long a server error may take to leave the process before the request ends. */
const FLUSH_MS = 2000;

/**
 * Errors from server components, route handlers and middleware. A no-op while Sentry is off.
 *
 * The SDK flushes after the response through `waitUntil`, which it implements for Vercel and
 * Cloudflare only. On Netlify the function can freeze before that flush runs, so the hook waits
 * for the flush itself (a short, bounded wait on the error path only).
 */
export const onRequestError: typeof Sentry.captureRequestError = async (...args) => {
  if (!sentryDsn()) return;
  Sentry.captureRequestError(...args);
  await Sentry.flush(FLUSH_MS);
};
