import { lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emailLoginCodes, emailVerificationTokens, sessions } from '../db/schema/index.js';
import type { JobCounts, JobDefinition } from './types.js';

/**
 * Daily at 08:30 India Standard Time, after the API wakes at 07:00: delete expired sessions, email verification links and email sign-in codes.
 * An expired row is dead already, so this only keeps the tables small. The count names avoid the
 * words the logger redacts.
 */
export const cleanupJob: JobDefinition = {
  name: 'cleanup',
  schedule: '30 8 * * *',
  description: 'Delete expired sessions, email verification links and email sign-in codes',
  async run(ctx): Promise<JobCounts> {
    const now = ctx.now();
    const expiredSessions = await db.delete(sessions).where(lt(sessions.expiresAt, now));
    const expiredLinks = await db
      .delete(emailVerificationTokens)
      .where(lt(emailVerificationTokens.expiresAt, now));
    const expiredLogins = await db
      .delete(emailLoginCodes)
      .where(lt(emailLoginCodes.expiresAt, now));
    return {
      sessions: expiredSessions.rowCount ?? 0,
      verifyLinks: expiredLinks.rowCount ?? 0,
      emailLogins: expiredLogins.rowCount ?? 0,
    };
  },
};
