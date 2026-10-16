// The Sentry DSN is a public ingest URL, inlined at build time through a literal
// `process.env.NEXT_PUBLIC_SENTRY_DSN` reference (lib/env.ts). Unset or blank means Sentry is off.

export function sentryDsn(): string | undefined {
  const value = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  return value ? value : undefined;
}

/**
 * The one origin a browser may send events to: `https://<host of the DSN>`. Null for a DSN that
 * is unset, is not a URL or is not https, so the CSP then allows no Sentry host at all.
 */
export function sentryIngestOrigin(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    return url.protocol === 'https:' ? `https://${url.host}` : null;
  } catch {
    return null;
  }
}
