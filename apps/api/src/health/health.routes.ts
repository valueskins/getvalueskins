import { Router } from 'express';
import { pool } from '../db/client.js';
import { AppError } from '../errors/AppError.js';
import { checkDbHealth } from './dbCheck.js';

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
