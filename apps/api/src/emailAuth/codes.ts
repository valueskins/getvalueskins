import { createHash, randomInt } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emailLoginCodes } from '../db/schema/index.js';
import { AppError } from '../errors/AppError.js';

const CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_LOGIN_CODE_TTL_MINUTES = CODE_TTL_MS / (60 * 1000);
const MAX_ATTEMPTS = 5;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashCode(email: string, code: string): string {
  return createHash('sha256').update(`${email}:${code}`).digest('hex');
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Invalidates any prior unused code for this email, then issues a new one. */
export async function createLoginCode(email: string): Promise<string> {
  const normalized = normalizeEmail(email);

  await db
    .update(emailLoginCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(emailLoginCodes.email, normalized), isNull(emailLoginCodes.usedAt)));

  const code = generateCode();
  await db.insert(emailLoginCodes).values({
    email: normalized,
    codeHash: hashCode(normalized, code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  return code;
}

/** Throws AppError('INVALID_CODE', 400, ...) for every failure mode (no code,
 * wrong code, expired, attempts exhausted) — indistinguishable from the
 * outside, so a mismatch never reveals which case occurred. */
export async function verifyLoginCode(email: string, code: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const invalid = (): AppError =>
    new AppError('INVALID_CODE', 400, 'That code is incorrect or has expired');

  const rows = await db
    .select()
    .from(emailLoginCodes)
    .where(and(eq(emailLoginCodes.email, normalized), isNull(emailLoginCodes.usedAt)))
    .orderBy(desc(emailLoginCodes.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) throw invalid();
  if (row.expiresAt.getTime() < Date.now()) throw invalid();
  if (row.attempts >= MAX_ATTEMPTS) throw invalid();

  if (row.codeHash !== hashCode(normalized, code)) {
    await db
      .update(emailLoginCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(emailLoginCodes.id, row.id));
    throw invalid();
  }

  await db
    .update(emailLoginCodes)
    .set({ usedAt: new Date() })
    .where(eq(emailLoginCodes.id, row.id));
}
