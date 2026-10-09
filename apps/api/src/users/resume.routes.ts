import type { ResumeResponse } from '@valueskins/shared';
import { Router } from 'express';
import { requireUser } from '../auth/guards.js';
import type { ApiContext } from '../context.js';
import { loadResume } from './resume.service.js';
import { TtlCache } from './ttlCache.js';

const RESUME_CACHE_SECONDS = 5 * 60;

/** SPEC 11: the hover card behind any username. Cached for 5 minutes. */
export function resumeRoutes(ctx: ApiContext): Router {
  const router = Router();
  const cache = new TtlCache<ResumeResponse>(RESUME_CACHE_SECONDS * 1000, ctx.now);

  router.get('/api/users/:id/resume', requireUser, async (req, res, next) => {
    try {
      const key = String(req.params.id);
      let resume = cache.get(key);
      if (!resume) {
        resume = await loadResume(key);
        cache.set(key, resume);
      }
      res.set('Cache-Control', `private, max-age=${RESUME_CACHE_SECONDS}`);
      res.json(resume);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
