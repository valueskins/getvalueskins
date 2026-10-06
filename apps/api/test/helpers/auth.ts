import { createSession } from '../../src/auth/session.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema/index.js';
import { buildTestEnv } from '../testEnv.js';

type NewUser = typeof users.$inferInsert;

let counter = 0;

/** Inserts a user and a real session; returns the cookie header to send. */
export async function createUserWithSession(overrides: Partial<NewUser> = {}) {
  counter += 1;
  const [user] = await db
    .insert(users)
    .values({
      username: `user${counter}`,
      name: `User ${counter}`,
      ...overrides,
    })
    .returning();
  const token = await createSession({ userId: user!.id });
  const env = buildTestEnv();

  return { user: user!, cookie: `${env.SESSION_COOKIE_NAME}=${token}` };
}

/** A user who signed in with Instagram (has an instagram_user_id). */
export function instagramUser(overrides: Partial<NewUser> = {}) {
  counter += 1;
  return createUserWithSession({
    instagramUserId: `ig-test-${counter}`,
    igAccountType: 'BUSINESS',
    igTokenEncrypted: 'encrypted',
    igTokenExpiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  });
}

/** A user who signed in with an email code (verified email, no Instagram). */
export function emailUser(overrides: Partial<NewUser> = {}) {
  counter += 1;
  return createUserWithSession({
    email: `email-user-${counter}@example.com`,
    emailVerifiedAt: new Date(),
    ...overrides,
  });
}
