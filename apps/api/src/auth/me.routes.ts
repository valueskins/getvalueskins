import { Router } from 'express';
import { requireUser } from './guards.js';

export function meRoutes(): Router {
  const router = Router();

  router.get('/api/me', requireUser, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
