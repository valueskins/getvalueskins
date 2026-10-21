import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { Pool, PoolClient } from 'pg';
import { databaseHost } from './databaseUrl.js';

/** The migrations the code ships, from `drizzle/meta/_journal.json`. */
export interface KnownMigration {
  tag: string;
  hash: string;
}

/** A row of `drizzle.__drizzle_migrations`: what the database has applied. */
export interface AppliedMigration {
  hash: string;
  createdAt: number;
}

export interface MigrationComparison {
  /** In the code, not in the database: the database is behind. */
  unapplied: KnownMigration[];
  /** In the database, not in the code: the code is behind (or a merged migration was edited). */
  unknown: AppliedMigration[];
}

/** `apps/api/drizzle`, found from this file, so it is the same under `src` (tsx) and `dist` (node). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export function readKnownMigrations(folder: string = MIGRATIONS_FOLDER): KnownMigration[] {
  const journal = JSON.parse(readFileSync(`${folder}/meta/_journal.json`, 'utf8')) as {
    entries: Array<{ tag: string }>;
  };
  // readMigrationFiles returns the entries in journal order, with the hash drizzle itself records.
  const files = readMigrationFiles({ migrationsFolder: folder });
  return journal.entries.map((entry, i) => ({ tag: entry.tag, hash: files[i]!.hash }));
}

/** Drizzle records each migration's sha256 and time. A database that was never migrated has none. */
export async function readAppliedMigrations(
  client: Pick<Pool | PoolClient, 'query'>,
): Promise<AppliedMigration[]> {
  try {
    const { rows } = await client.query<{ hash: string; created_at: string | number }>(
      'select hash, created_at from drizzle.__drizzle_migrations order by created_at',
    );
    return rows.map((r) => ({ hash: r.hash, createdAt: Number(r.created_at) }));
  } catch (err) {
    // 42P01: no such table. 3F000: no such schema. Both mean nothing has been applied.
    const code = (err as { code?: string }).code;
    if (code === '42P01' || code === '3F000') return [];
    throw err;
  }
}

/** Pure. Migrations are matched by hash, so an edited merged migration shows up as both kinds. */
export function compareMigrations(
  known: readonly KnownMigration[],
  applied: readonly AppliedMigration[],
): MigrationComparison {
  const knownHashes = new Set(known.map((m) => m.hash));
  const appliedHashes = new Set(applied.map((m) => m.hash));
  return {
    unapplied: known.filter((m) => !appliedHashes.has(m.hash)),
    unknown: applied.filter((m) => !knownHashes.has(m.hash)),
  };
}

/** What to tell a person, one line per problem. Names the migrations, and says what to do. */
export function migrationProblems(comparison: MigrationComparison): string[] {
  const problems: string[] = [];
  if (comparison.unapplied.length > 0) {
    problems.push(
      `The code has ${comparison.unapplied.length} migration(s) the database has not applied: ${comparison.unapplied
        .map((m) => m.tag)
        .join(', ')}. Run them by hand before this deploy (docs/DEPLOYMENT.md section 21.4).`,
    );
  }
  if (comparison.unknown.length > 0) {
    problems.push(
      `The database has ${comparison.unknown.length} migration(s) this code does not know (hash ${comparison.unknown
        .map((m) => m.hash.slice(0, 10))
        .join(', ')}, applied ${comparison.unknown
        .map((m) => new Date(m.createdAt).toISOString())
        .join(
          ', ',
        )}). This code is older than the database, or a merged migration was edited. Deploy the newer code, or restore the database (docs/RUNBOOK.md section 7).`,
    );
  }
  return problems;
}

/**
 * A hint from the error code only. Never the connection string, and not the raw message either: it
 * can carry the host or the user name.
 */
export function describeConnectionError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  const message = err instanceof Error ? err.message : '';
  if (code === 'ENOTFOUND')
    return 'ENOTFOUND: the database host name was not found. Check the host in DATABASE_URL.';
  if (code === 'ECONNREFUSED')
    return 'ECONNREFUSED: nothing is listening at the database host and port in DATABASE_URL.';
  if (code === 'ETIMEDOUT' || /timeout/i.test(message)) {
    return 'timeout: the database did not answer in time (a Neon compute can take several seconds to wake). Try again, and check that DATABASE_URL is right.';
  }
  if (code === '28P01')
    return '28P01: the database refused the user name or password in DATABASE_URL.';
  if (code === '3D000') return '3D000: the database named in DATABASE_URL does not exist.';
  if (/SSL|TLS|certificate/i.test(message)) {
    return `${code || 'tls'}: the TLS connection failed. Neon needs ?sslmode=require on DATABASE_URL.`;
  }
  return `${code || 'unknown error'}: could not connect to the database. Check DATABASE_URL.`;
}

export interface DatabaseCheck {
  /** Empty when the database is reachable and its migrations match the code. */
  problems: string[];
  host: string | null;
}

/**
 * The checks the API makes before it listens (SPEC 19): the database answers, and its applied
 * migrations are exactly the ones this code ships. Neither direction is allowed: a database behind
 * the code would fail at the first query that needs the missing change, and a database ahead of it
 * means a rollback to older code.
 */
export async function verifyDatabase(
  pool: Pick<Pool | PoolClient, 'query'>,
  options: { databaseUrl?: string; folder?: string } = {},
): Promise<DatabaseCheck> {
  const host = options.databaseUrl ? databaseHost(options.databaseUrl) : null;
  try {
    await pool.query('select 1');
  } catch (err) {
    return {
      host,
      problems: [
        `Could not connect to the database${host ? ` at ${host}` : ''}. ${describeConnectionError(err)}`,
      ],
    };
  }
  const known = readKnownMigrations(options.folder);
  const applied = await readAppliedMigrations(pool);
  return { host, problems: migrationProblems(compareMigrations(known, applied)) };
}
