import * as Sentry from '@sentry/node';
import { scrubSentryEvent } from '@valueskins/shared';

let enabled = false;

/** True once `initSentry` has started the SDK with a DSN. Everything else in this file is then a no-op. */
export function sentryEnabled(): boolean {
  return enabled;
}

/**
 * Starts Sentry for errors only (SPEC 20). Off unless a DSN is given. Nothing leaves the process
 * unscrubbed: the user (and so the IP), request headers, cookies and bodies, breadcrumbs and stack
 * variables are dropped, and every remaining string has emails, UPI IDs, bank-account-shaped
 * numbers and tokens removed (`scrubSentryEvent`). No tracing, no logs, no profiling, no default
 * integrations (they add breadcrumbs and request data). Returns whether it started.
 */
export function initSentry(dsn: string | undefined, environment: string): boolean {
  if (enabled || !dsn) return enabled;
  try {
    Sentry.init({
      dsn,
      environment,
      tracesSampleRate: 0,
      maxBreadcrumbs: 0,
      includeLocalVariables: false,
      defaultIntegrations: false,
      integrations: [Sentry.linkedErrorsIntegration(), Sentry.dedupeIntegration()],
      beforeSend: (event) => scrubSentryEvent(event as unknown as Record<string, unknown>) as never,
      beforeBreadcrumb: () => null,
    });
    // The SDK ignores a DSN it cannot parse instead of throwing, so ask it.
    enabled = Sentry.getClient()?.getDsn() !== undefined;
  } catch {
    // A bad DSN must never stop the API from serving. The env check already requires https.
    enabled = false;
  }
  return enabled;
}

/** Sends an unexpected error (never a 4xx the caller caused). Safe to call when Sentry is off. */
export function captureError(error: unknown, where: string): void {
  if (!enabled) return;
  try {
    Sentry.captureException(error, { tags: { where } });
  } catch {
    // Reporting an error must never raise another.
  }
}

/** Waits for queued events to be sent, for shutdown. Resolves at once when Sentry is off. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Shutting down: nothing to do about it.
  }
}

/** Test hook: forget that Sentry started (the SDK itself is closed by the test). */
export async function resetSentryForTests(): Promise<void> {
  await Sentry.close(0);
  enabled = false;
}
