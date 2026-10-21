/**
 * Checks on the database connection string that need no connection (SPEC 19). Pure, so the startup
 * guards, the migration command and the tests share one rule. A message never contains the string:
 * it holds the password.
 */

const TLS_MODES = ['require', 'verify-ca', 'verify-full'];

/** The host of a connection string, or null when it cannot be read. */
export function databaseHost(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    if (host !== '') return host;
  } catch {
    // Fall through to the pattern below.
  }
  const match = url.match(/@([^/:?#]+)/);
  return match?.[1] ?? null;
}

export function isLocalDatabaseHost(host: string | null): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

/** The `sslmode` of a connection string, or null when it has none. */
function sslMode(url: string): string | null {
  return url.match(/[?&]sslmode=([^&#]*)/)?.[1] ?? null;
}

/**
 * Why this connection string cannot be used. A Neon pooled host (`-pooler` in the endpoint id) runs
 * PgBouncer in transaction mode, where session-level advisory locks do not work, and the scheduled
 * jobs and the migration lock depend on them. `requireTls` is set for production, and by the
 * migration command for any remote host.
 */
export function databaseUrlProblems(url: string, options: { requireTls: boolean }): string[] {
  const problems: string[] = [];
  const host = databaseHost(url);

  if (host !== null && host.includes('-pooler')) {
    problems.push(
      'DATABASE_URL points at a pooled host (its name contains "-pooler"). Use the direct connection string: advisory locks need it',
    );
  }
  if (options.requireTls) {
    const mode = sslMode(url);
    if (mode === null || !TLS_MODES.includes(mode)) {
      problems.push('DATABASE_URL must include sslmode=require (TLS is required)');
    }
  }
  return problems;
}
