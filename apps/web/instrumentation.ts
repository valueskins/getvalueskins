import * as Sentry from '@sentry/nextjs';
import { sentryDsn } from './lib/sentryDsn';
import { initSentry } from './lib/sentryInit';

export function register(): void {
  initSentry('server');
}

/** Errors from server components, route handlers and middleware. A no-op while Sentry is off. */
export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (sentryDsn()) Sentry.captureRequestError(...args);
};
