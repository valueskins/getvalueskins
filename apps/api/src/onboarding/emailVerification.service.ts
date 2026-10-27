import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emailVerificationTokens, users } from '../db/schema/index.js';
import { send } from '../email/send.js';
import type { Env } from '../env/index.js';
import { AppError } from '../errors/AppError.js';

/** SPEC 6.4: valid for 24 hours, single use, only the hash stored. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Replaces any unused token for the user with a new one and emails the link. */
export async function issueEmailVerification(
  env: Env,
  userId: string,
  email: string,
): Promise<void> {
  const token = randomBytes(32).toString('base64url');

  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt)));
  await db.insert(emailVerificationTokens).values({
    userId,
    email,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });

  // Sent after the writes, and send() never throws (SPEC 8).
  await send(
    'VERIFY_EMAIL',
    email,
    { verifyUrl: `${env.WEB_ORIGIN}/verify-email?token=${token}` },
    env,
    { userId },
  );
}

/** The address of the latest unused token for this user, expired or not. */
export async function findPendingEmail(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: emailVerificationTokens.email })
    .from(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt)))
    .orderBy(desc(emailVerificationTokens.createdAt))
    .limit(1);
  return row?.email ?? null;
}

/**
 * GET /api/me `pendingEmail` (SPEC 6.4): the address the last link went to while that link can still
 * be used (unused and unexpired) and the address is not already the verified one. Resend keeps
 * `findPendingEmail`, which also offers a fresh link for an expired one.
 */
export async function findOpenPendingEmail(
  userId: string,
  verifiedEmail: string | null,
  now: Date,
): Promise<string | null> {
  const [row] = await db
    .select({ email: emailVerificationTokens.email })
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.userId, userId),
        isNull(emailVerificationTokens.usedAt),
        gt(emailVerificationTokens.expiresAt, now),
      ),
    )
    .orderBy(desc(emailVerificationTokens.createdAt))
    .limit(1);
  if (!row) return null;
  return verifiedEmail !== null && row.email.toLowerCase() === verifiedEmail.toLowerCase()
    ? null
    : row.email;
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | null)?.cause;
  return (error as { code?: string } | null)?.code === '23505' || cause?.code === '23505';
}

/**
 * Consumes the token and, in the same transaction, makes its address the verified email of the user
 * the token was issued to. The token alone decides that user (SPEC 6.4): it proves the person can
 * read that inbox, so the link works in any browser, signed in or not, and never signs anyone in.
 * Every bad token (unknown, expired, used) is the same INVALID_TOKEN, so nothing can be probed.
 */
export async function verifyEmailToken(
  token: string,
  now: Date = new Date(),
): Promise<{ userId: string; email: string }> {
  const invalid = () => new AppError('INVALID_TOKEN', 400, 'This link is invalid or has expired.');

  try {
    return await db.transaction(async (tx) => {
      const [consumed] = await tx
        .update(emailVerificationTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(emailVerificationTokens.tokenHash, hashToken(token)),
            isNull(emailVerificationTokens.usedAt),
            gt(emailVerificationTokens.expiresAt, now),
          ),
        )
        .returning({
          userId: emailVerificationTokens.userId,
          email: emailVerificationTokens.email,
        });

      if (!consumed) throw invalid();

      await tx
        .update(users)
        .set({ email: consumed.email, emailVerifiedAt: now })
        .where(eq(users.id, consumed.userId));
      return consumed;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        'EMAIL_TAKEN',
        409,
        'That email address is already used by another account.',
      );
    }
    throw error;
  }
}
