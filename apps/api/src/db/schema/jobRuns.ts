import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * When each scheduled job last succeeded (SPEC 14). `runJob` writes it after a successful run, and
 * the catch-up at startup reads it to find the runs that fell due while the API was asleep. One row
 * per job, so no foreign key and no extra index.
 */
export const jobRuns = pgTable('job_runs', {
  jobName: varchar('job_name', { length: 64 }).primaryKey(),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }).notNull(),
});
