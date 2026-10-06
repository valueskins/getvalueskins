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

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | null)?.cause;
  return (error as { code?: string } | null)?.code === '23505' || cause?.code === '23505';
}

/**
 * Consumes the token and, in the same transaction, makes its address the
 * user's verified email. Every bad token (unknown, expired, used, someone
 * else's) is the same INVALID_TOKEN, so nothing can be probed.
 */
export async function verifyEmailToken(userId: string, token: string): Promise<void> {
  const invalid = () => new AppError('INVALID_TOKEN', 400, 'This link is invalid or has expired.');

  try {
    await db.transaction(async (tx) => {
      const [consumed] = await tx
        .update(emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(emailVerificationTokens.tokenHash, hashToken(token)),
            eq(emailVerificationTokens.userId, userId),
            isNull(emailVerificationTokens.usedAt),
            gt(emailVerificationTokens.expiresAt, new Date()),
          ),
        )
        .returning({ email: emailVerificationTokens.email });

      if (!consumed) throw invalid();

      await tx
        .update(users)
        .set({ email: consumed.email, emailVerifiedAt: new Date() })
        .where(eq(users.id, userId));
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
