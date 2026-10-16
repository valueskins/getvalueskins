import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@valueskins/shared';
import { sentryDsn } from './sentryDsn';

/**
 * Starts Sentry for errors only (SPEC 20), in the browser or on the server. Off unless
 * NEXT_PUBLIC_SENTRY_DSN is set. No tracing, replay, breadcrumbs or default integrations (they
 * add clicks, URLs and request data), and every event goes through the shared scrubber, which
 * removes the user and IP, cookies, headers, bodies, query strings, emails, UPI IDs and tokens.
 */
export function initSentry(runtime: 'client' | 'server'): void {
  const dsn = sentryDsn();
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    defaultIntegrations: false,
    integrations: [
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      // window.onerror and unhandled rejections only exist in the browser.
      ...(runtime === 'client' ? [Sentry.globalHandlersIntegration()] : []),
    ],
    beforeSend: (event) => scrubSentryEvent(event as unknown as Record<string, unknown>) as never,
    beforeBreadcrumb: () => null,
  });
}

/** Sends an error to Sentry when it is on (error boundaries use this). */
export function reportError(error: unknown): void {
  if (!sentryDsn()) return;
  Sentry.captureException(error);
}
