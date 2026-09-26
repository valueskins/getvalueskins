import { Router } from 'express';
import type { Env } from '../env/index.js';
import { clearSessionCookie, getCookie } from './cookies.js';
import { deleteSessionByToken } from './session.js';

/** Tolerant/idempotent: no requireUser — logging out with no/expired session
 * shouldn't 401 (SPEC 6.3: "Logout deletes the session row"). */
export function logoutRoutes(env: Env): Router {
  const router = Router();

  router.post('/api/auth/logout', async (req, res, next) => {
    try {
      const token = getCookie(req, env.SESSION_COOKIE_NAME);
      if (token) {
        await deleteSessionByToken(token);
      }
      clearSessionCookie(res, env);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
