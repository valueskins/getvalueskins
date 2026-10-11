import { Router } from 'express';
import { requireUser } from '../auth/guards.js';
import type { ApiContext } from '../context.js';
import { completeOnboardingIfReady } from '../onboarding/onboarding.service.js';
import { profileLimiter } from '../rateLimit/limiters.js';
import { saveProfile } from './profile.service.js';

/** SPEC 6.4 and 16: profile details, saved once and then locked. Both roles; the fields differ. */
export function profileRoutes(ctx: ApiContext): Router {
  const router = Router();

  router.put('/api/me/profile', requireUser, profileLimiter, async (req, res, next) => {
    try {
      const profileDetails = await saveProfile(
        req.user!,
        req.body,
        ctx.now(),
        ctx.env.SUPPORT_EMAIL,
      );
      res.json({ profileDetails, onboarding: await completeOnboardingIfReady(req.user!.id) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
