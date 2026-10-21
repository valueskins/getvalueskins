import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, db, pool } from './client.js';
import { databaseHost, databaseUrlProblems, isLocalDatabaseHost } from './databaseUrl.js';
import {
  MIGRATIONS_FOLDER,
  compareMigrations,
  describeConnectionError,
  migrationWarnings,
  readAppliedMigrations,
  readKnownMigrations,
} from './startupCheck.js';

/**
 * `pnpm db:migrate`. Production is migrated by hand with this, before each deploy that adds a
 * migration (docs/DEPLOYMENT.md section 21.4): the free Render instance has no pre-deploy step, and
 * the API never migrates on start. DATABASE_URL comes from the shell, never from a file. It refuses
 * a pooled host (advisory locks need the direct string) and a remote host without TLS.
 */
async function main(): Promise<void> {
  const url =
    process.env.NODE_ENV === 'test' ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  const host = databaseHost(url ?? '');
  const problems = databaseUrlProblems(url ?? '', { requireTls: !isLocalDatabaseHost(host) });
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
    return;
  }

  console.log(`database host: ${host ?? 'unknown'}`);
  try {
    await pool.query('select 1');
  } catch (err) {
    console.error(`Could not connect to the database. ${describeConnectionError(err)}`);
    process.exitCode = 1;
    return;
  }

  const known = readKnownMigrations();
  const before = compareMigrations(known, await readAppliedMigrations(pool));
  for (const warning of migrationWarnings(before)) console.warn(warning);
  if (before.unknown.length > 0 && before.unapplied.length > 0) {
    // Drizzle applies a migration only if it is newer than the newest one recorded, so migrations
    // missing from behind a newer one would be skipped. Run this from the newest code.
    console.error(
      `The database is ahead of this checkout and also lacks ${before.unapplied.map((m) => m.tag).join(', ')}. Nothing was applied. Run this command from the newest main (git pull).`,
    );
    process.exitCode = 1;
    return;
  }
  if (before.unapplied.length === 0) {
    console.log('no migrations to apply: the database is up to date');
    return;
  }
  console.log(`to apply: ${before.unapplied.map((m) => m.tag).join(', ')}`);

  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  const after = compareMigrations(known, await readAppliedMigrations(pool));
  if (after.unapplied.length > 0) {
    console.error('The migrations did not match the code after the run. Check the database.');
    process.exitCode = 1;
    return;
  }
  console.log('migrations applied');
}

main()
  .catch((err: unknown) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
