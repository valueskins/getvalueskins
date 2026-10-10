import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, db, pool } from '../../src/db/client.js';

export { closeDb, db, pool };

const TABLES_IN_DELETE_ORDER = [
  'deal_events',
  'email_log',
  'disputes',
  'invoices',
  'invoice_counters',
  'transfers',
  'payments',
  'content_uploads',
  'applications',
  'deals',
  'sessions',
  'email_verification_tokens',
  'email_login_codes',
  'brand_billing',
  'meta_deletion_requests',
  'webhook_events',
  'rate_limiter_points',
  'users',
];

export async function truncateAll(): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES_IN_DELETE_ORDER.join(', ')} CASCADE`));
}

/**
 * Drops and rebuilds the test database from scratch, then applies every
 * migration. Each test file calls this once (in beforeAll) so it's
 * self-sufficient regardless of what a previous `vitest run` invocation
 * left behind — a real Postgres database persists across separate runs,
 * unlike in-process state.
 *
 * Drops both "public" (our tables) and "drizzle" (the migration journal)
 * schemas: dropping only "public" would leave the journal claiming
 * migration 0000 is already applied, so migrate() would skip it and leave
 * "public" empty.
 */
export async function resetDb(): Promise<void> {
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await migrate(db, { migrationsFolder: 'drizzle' });
}
