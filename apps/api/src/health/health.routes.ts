import { Router } from 'express';
import { pool } from '../db/client.js';
import { AppError } from '../errors/AppError.js';
import { checkDbHealth } from './dbCheck.js';

/**
 * The cheap health check Render calls every few seconds. It must never touch the database, a
 * session or the rate limiter: any of them would keep the free Neon database awake all day
 * (docs/DEPLOYMENT.md section 21.8). `GET /api/health` is the deeper check, for use by hand.
 */
export function healthzRoutes(): Router {
  const router = Router();

  router.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  return router;
}

export function healthRoutes(): Router {
  const router = Router();

  router.get('/api/health', async (_req, res, next) => {
    try {
      const healthy = await checkDbHealth(pool);
      if (!healthy) {
        next(new AppError('SERVICE_UNAVAILABLE', 503, 'Database unavailable'));
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
