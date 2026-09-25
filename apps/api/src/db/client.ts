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

export const pool = new Pool({ connectionString: resolveConnectionString() });

export const db = drizzle(pool, { schema });

export async function withTransaction<T>(fn: Parameters<typeof db.transaction<T>>[0]): Promise<T> {
  return db.transaction(fn);
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
