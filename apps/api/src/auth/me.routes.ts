import { Router } from 'express';
import type { Env } from '../env/index.js';
import { softDeleteAndAnonymizeUser } from '../meta/deletion.service.js';
import { clearSessionCookie } from './cookies.js';
import { requireUser } from './guards.js';

export function meRoutes(env: Env): Router {
  const router = Router();

  router.get('/api/me', requireUser, (req, res) => {
    res.json({ user: req.user });
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
