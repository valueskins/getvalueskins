import { logger } from '../logging/logger.js';
import { captureError, flushSentry } from '../observability/sentry.js';
import { pool } from './client.js';
import { verifyDatabase } from './startupCheck.js';

/**
 * Called by `index.ts` before the API listens. If the database cannot be reached, or the code has
 * migrations the database has not applied, it logs every problem and ends the process with exit code
 * 1, so the host shows a failed start with a reason and never serves a request against a schema that
 * is missing a change. If the database has migrations the code does not know, it logs a warning
 * naming them and starts.
 */
export async function exitUnlessDatabaseReady(databaseUrl: string): Promise<void> {
  const { problems, warnings, host } = await verifyDatabase(pool, { databaseUrl });
  for (const warning of warnings)
    logger.warn({ databaseHost: host }, `${warning} Starting anyway.`);
  if (problems.length === 0) {
    logger.info(
      { databaseHost: host },
      warnings.length === 0
        ? 'database reachable, migrations match the code'
        : 'database reachable, every migration the code has is applied (the database is ahead)',
    );
    return;
  }
  for (const problem of problems) logger.error(problem);
  logger.error('Startup check failed: the API did not start (docs/DEPLOYMENT.md section 21.4)');
  captureError(new Error(problems.join(' ')), 'startup database check');
  await flushSentry();
  process.exit(1);
}
