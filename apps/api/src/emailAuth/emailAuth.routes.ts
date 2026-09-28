import { emailLoginStartSchema, emailLoginVerifySchema } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { setSessionCookie } from '../auth/cookies.js';
import { createSession, toAuthenticatedUser } from '../auth/session.js';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import type { Env } from '../env/index.js';
import { send } from '../email/send.js';
import { loginIpLimiter } from '../rateLimit/limiters.js';
import {
  EMAIL_LOGIN_CODE_TTL_MINUTES,
  createLoginCode,
  normalizeEmail,
  verifyLoginCode,
} from './codes.js';

/** Placeholder for an email-only account with no Instagram handle to derive
 * from — the local-part of the email, truncated. Not a display-name choice. */
function usernameFromEmail(email: string): string {
  const localPart = email.split('@')[0]?.toLowerCase().trim() ?? '';
  return (localPart || 'user').slice(0, 255);
}

/** SPEC 6.5, V0_LAUNCH 2.1. Mounted only when AUTH_EMAIL_ENABLED (see app.ts) —
 * when disabled, these routes are genuinely absent, not present-but-guarded. */
export function emailAuthRoutes(env: Env): Router {
  const router = Router();

  router.post('/api/auth/email/start', loginIpLimiter, async (req, res, next) => {
    try {
      const input = emailLoginStartSchema.parse(req.body);
      const code = await createLoginCode(input.email);
      // Never branch on whether a user exists for this email: responding
      // identically either way is the non-enumeration guarantee itself.
      await send(
        'SIGN_IN_CODE',
        normalizeEmail(input.email),
        { code, expiresInMinutes: EMAIL_LOGIN_CODE_TTL_MINUTES },
        env,
      );
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/auth/email/verify', loginIpLimiter, async (req, res, next) => {
    try {
      const input = emailLoginVerifySchema.parse(req.body);
      const email = normalizeEmail(input.email);
      await verifyLoginCode(email, input.code);

      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
      let user = existing[0];

      if (user) {
        if (!user.emailVerifiedAt) {
          const [updated] = await db
            .update(users)
            .set({ emailVerifiedAt: new Date() })
            .where(eq(users.id, user.id))
            .returning();
          user = updated;
        }
      } else {
        const username = usernameFromEmail(email);
        const [inserted] = await db
          .insert(users)
          .values({ username, name: username, email, emailVerifiedAt: new Date() })
          .returning();
        user = inserted;
      }
      if (!user) throw new Error('email verify: failed to find or create user');

      const userAgent = req.headers['user-agent'];
      const token = await createSession({
        userId: user.id,
        ip: req.ip,
        userAgent: typeof userAgent === 'string' ? userAgent : undefined,
      });
      setSessionCookie(res, env, token);

      res.json({ user: toAuthenticatedUser(user) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
