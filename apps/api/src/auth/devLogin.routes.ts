import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { devLoginSchema } from '@valueskins/shared';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import type { Env } from '../env/index.js';
import { setSessionCookie } from './cookies.js';
import { createSession, toAuthenticatedUser } from './session.js';

const DEV_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * SPEC 6.2: creates or logs in a fake user with fake Instagram data. Only
 * mounted when NODE_ENV !== 'production' && ENABLE_DEV_LOGIN (see app.ts) —
 * when disabled, this route is genuinely absent, not present-but-guarded.
 */
export function devLoginRoutes(env: Env): Router {
  const router = Router();

  router.post('/api/dev/login', async (req, res, next) => {
    try {
      const input = devLoginSchema.parse(req.body);

      const existing = await db
        .select()
        .from(users)
        .where(eq(users.username, input.username))
        .limit(1);

      let user = existing[0];
      if (!user) {
        const inserted = await db
          .insert(users)
          .values({
            instagramUserId: `dev_${input.username}`,
            username: input.username,
            name: input.username,
            // The role is a dev-only shortcut, so the account type is set to match it.
            igAccountType: input.role === 'BRAND' ? 'BUSINESS' : 'MEDIA_CREATOR',
            role: input.role,
            roleLockedAt: new Date(),
            igTokenEncrypted: 'dev-fake-token',
            igTokenExpiresAt: new Date(Date.now() + DEV_TOKEN_TTL_MS),
          })
          .returning();
        user = inserted[0];
      }
      // role from the body only applies at creation — an existing dev user's
      // role is never overwritten on repeat logins (mirrors real role-lock).
      if (!user) throw new Error('failed to find or create dev user');

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
