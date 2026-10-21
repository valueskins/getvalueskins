import { logger } from '../logging/logger.js';
import { captureError, flushSentry } from '../observability/sentry.js';
import { pool } from './client.js';
import { verifyDatabase } from './startupCheck.js';

/**
 * Called by `index.ts` before the API listens. If the database cannot be reached, or its migrations
 * do not match the code, it logs every problem and ends the process with exit code 1, so the host
 * shows a failed start with a reason and never serves a request against the wrong schema.
 */
export async function exitUnlessDatabaseReady(databaseUrl: string): Promise<void> {
  const { problems, host } = await verifyDatabase(pool, { databaseUrl });
  if (problems.length === 0) {
    logger.info({ databaseHost: host }, 'database reachable, migrations match the code');
    return;
  }
  for (const problem of problems) logger.error(problem);
  logger.error('Startup check failed: the API did not start (docs/DEPLOYMENT.md section 21.4)');
  captureError(new Error(problems.join(' ')), 'startup database check');
  await flushSentry();
  process.exit(1);
}
