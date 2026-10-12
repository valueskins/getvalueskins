import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../env/index.js';
import { getCookie, setSessionCookie } from './cookies.js';
import { findValidSession, refreshSessionIfStale, touchLastActive } from './session.js';

/** Attaches req.user when a valid session cookie is present. Never enforces —
 * that's the guards' job (auth/guards.ts). */
export function sessionMiddleware(env: Env, now: () => Date = () => new Date()) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getCookie(req, env.SESSION_COOKIE_NAME);
      if (!token) {
        next();
        return;
      }

      const resolved = await findValidSession(token);
      if (!resolved) {
        next();
        return;
      }

      req.user = resolved.user;
      await touchLastActive(resolved.user.id, resolved.lastActiveAt, now());

      const refreshedExpiresAt = await refreshSessionIfStale(
        resolved.sessionId,
        resolved.expiresAt,
      );
      if (refreshedExpiresAt) {
        setSessionCookie(res, env, token);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
