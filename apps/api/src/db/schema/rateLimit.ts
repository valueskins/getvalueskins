import { bigint, integer, pgTable, varchar } from 'drizzle-orm/pg-core';

/**
 * Tracking table for rate-limiter-flexible's RateLimiterPostgres. Column shape
 * matches what the library expects exactly, created via migration (not the
 * library's own runtime DDL) so it's passed `tableCreated: true`.
 */
export const rateLimiterPoints = pgTable('rate_limiter_points', {
  key: varchar('key', { length: 255 }).primaryKey(),
  points: integer('points').notNull().default(0),
  expire: bigint('expire', { mode: 'number' }),
});
