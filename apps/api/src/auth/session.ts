import { randomBytes, createHash } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions, users } from '../db/schema/index.js';
import { SESSION_TTL_MS } from './cookies.js';
import type { AuthenticatedUser } from './types.js';

/** Only re-extend a session once it's past the halfway point of its life,
 * rather than on every single request. */
const REFRESH_THRESHOLD_MS = SESSION_TTL_MS / 2;

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function toAuthenticatedUser(row: typeof users.$inferSelect): AuthenticatedUser {
  return {
    id: row.id,
    instagramUserId: row.instagramUserId,
    username: row.username,
    role: row.role,
    isAdmin: row.isAdmin,
    onboardingCompletedAt: row.onboardingCompletedAt,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
  };
}

export interface CreateSessionInput {
  userId: string;
  ip?: string;
  userAgent?: string;
}

export async function createSession(input: CreateSessionInput): Promise<string> {
  const token = randomBytes(32).toString('base64url');

  await db.insert(sessions).values({
    userId: input.userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return token;
}

export interface ResolvedSession {
  sessionId: string;
  expiresAt: Date;
  user: AuthenticatedUser;
}

/** Looks up a session by its raw cookie token. Never throws — returns null on
 * any miss (no cookie value, no matching row, expired). */
export async function findValidSession(token: string): Promise<ResolvedSession | null> {
  const tokenHash = hashToken(token);

  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    sessionId: row.session.id,
    expiresAt: row.session.expiresAt,
    user: toAuthenticatedUser(row.user),
  };
}

/** Sliding expiry: re-extends and returns the new expiry only once the
 * session is past the halfway point of its life; otherwise returns null. */
export async function refreshSessionIfStale(
  sessionId: string,
  currentExpiresAt: Date,
): Promise<Date | null> {
  if (currentExpiresAt.getTime() - Date.now() >= REFRESH_THRESHOLD_MS) {
    return null;
  }

  const newExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.update(sessions).set({ expiresAt: newExpiresAt }).where(eq(sessions.id, sessionId));
  return newExpiresAt;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
