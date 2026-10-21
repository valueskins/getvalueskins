import { existsSync } from 'node:fs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

function resolveConnectionString(): string {
  const isTest = process.env.NODE_ENV === 'test';
  const url = isTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      isTest ? 'TEST_DATABASE_URL is not set (NODE_ENV=test)' : 'DATABASE_URL is not set',
    );
  }
  return url;
}

/**
 * A small pool: Neon's free plan has few connections, and one connection is held for the whole run
 * of a scheduled job (its advisory lock). A connection that cannot be had in 30 seconds is an error,
 * not a hang: that covers a Neon compute that is waking up, and a pool that is somehow exhausted.
 */
export const pool = new Pool({
  connectionString: resolveConnectionString(),
  max: 5,
  connectionTimeoutMillis: 30_000,
});

// A Neon compute that suspends, or a restart on the database's side, drops idle connections. The
// pool reports that as an 'error' event, and an event nobody listens to would end the process.
// Only the code is logged: the message can carry the host.
pool.on('error', (err: Error & { code?: string }) => {
  console.error(`database pool: an idle connection failed (${err.code ?? 'no code'})`);
});

export const db = drizzle(pool, { schema });

export async function withTransaction<T>(fn: Parameters<typeof db.transaction<T>>[0]): Promise<T> {
  return db.transaction(fn);
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
