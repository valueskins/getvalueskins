import express, { type Express } from 'express';
import './auth/types.js'; // Express.Request augmentation (req.user)
import { devLoginRoutes } from './auth/devLogin.routes.js';
import { logoutRoutes } from './auth/logout.routes.js';
import { meRoutes } from './auth/me.routes.js';
import { sessionMiddleware } from './auth/sessionMiddleware.js';
import { errorMiddleware, notFoundHandler } from './errors/errorMiddleware.js';
import type { Env } from './env/index.js';
import { healthRoutes } from './health/health.routes.js';
import { httpLogger } from './logging/httpLogger.js';
import { globalUserLimiter } from './rateLimit/limiters.js';
import {
  RAZORPAY_WEBHOOK_PATH,
  corsMiddleware,
  helmetMiddleware,
  jsonBodyMiddleware,
  originCheck,
  webhookRawBodyMiddleware,
} from './security/index.js';

export function createApp(env: Env): Express {
  const app = express();

  // Needed so IP-scoped rate limiters see the real client IP behind Render's proxy.
  app.set('trust proxy', 1);

  app.use(httpLogger);
  app.use(helmetMiddleware);
  app.use(corsMiddleware(env));

  // Reserves raw-body access for signature verification (a future prompt) —
  // must come before the global JSON parser below.
  app.use(RAZORPAY_WEBHOOK_PATH, webhookRawBodyMiddleware);
  app.use(jsonBodyMiddleware);

  app.use(originCheck(env));
  app.use(sessionMiddleware(env));
  app.use('/api', globalUserLimiter);

  app.use(healthRoutes());
  app.use(meRoutes());
  if (env.NODE_ENV !== 'production' && env.ENABLE_DEV_LOGIN) {
    app.use(devLoginRoutes(env));
  }
  app.use(logoutRoutes(env));

  app.use(notFoundHandler);
  app.use(errorMiddleware);

  return app;
}
