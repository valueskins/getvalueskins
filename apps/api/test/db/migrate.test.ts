import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, db } from './testDb.js';

const EXPECTED_TABLES = [
  'users',
  'brand_billing',
  'sessions',
  'email_verification_tokens',
  'email_login_codes',
  'deals',
  'content_uploads',
  'applications',
  'payments',
  'direct_payments',
  'invoices',
  'invoice_counters',
  'deal_events',
  'email_log',
  'disputes',
  'webhook_events',
  'meta_deletion_requests',
  'rate_limiter_points',
  'job_runs',
];

describe('migrations', () => {
  beforeAll(async () => {
    // Drop both schemas: drizzle's migration journal lives in its own
    // "drizzle" schema, separate from "public" — dropping only "public"
    // leaves the journal saying migration 0000 is already applied, so
    // migrate() would skip it and leave "public" empty.
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`DROP SCHEMA public CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('applies cleanly to an empty database and creates every table', async () => {
    await expect(migrate(db, { migrationsFolder: 'drizzle' })).resolves.toBeUndefined();

    const result = await db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `);
    const tableNames = result.rows.map((row) => row.table_name);

    for (const expected of EXPECTED_TABLES) {
      expect(tableNames).toContain(expected);
    }
    expect(tableNames).toHaveLength(EXPECTED_TABLES.length);
  });
});
