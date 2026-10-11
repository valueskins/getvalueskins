import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import type { ApiContext } from '../context.js';
import { softDeleteAndAnonymizeUser } from '../meta/deletion.service.js';
import { loadOnboardingState } from '../onboarding/onboarding.service.js';
import { clearSessionCookie } from './cookies.js';
import { requireUser } from './guards.js';
import { toProfileDetails } from '../profile/profile.service.js';
import { toMeProfile } from './profile.js';

export function meRoutes(ctx: ApiContext): Router {
  const { env } = ctx;
  const router = Router();

  router.get('/api/me', requireUser, async (req, res, next) => {
    try {
      const [row] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
      res.json({
        user: req.user,
        profile: row ? toMeProfile(row) : null,
        profileDetails: row ? toProfileDetails(row, ctx.now()) : null,
        onboarding: await loadOnboardingState(req.user!.id),
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/api/me', requireUser, async (req, res, next) => {
    try {
      await softDeleteAndAnonymizeUser(req.user!.id);
      clearSessionCookie(res, env);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
