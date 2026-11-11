import express, { type Express } from 'express';
import './auth/types.js'; // Express.Request augmentation (req.user)
import type { ApiContext } from './context.js';
import { adminRoutes } from './admin/admin.routes.js';
import { applicationRoutes } from './applications/applications.routes.js';
import { directPaymentRoutes } from './directPayments/directPayments.routes.js';
import { disputeRoutes } from './disputes/disputes.routes.js';
import { documentRoutes } from './documents/documents.routes.js';
import { configRoutes } from './config/config.routes.js';
import { dealRoutes } from './deals/deals.routes.js';
import { reviewRoutes } from './deals/review.routes.js';
import { devLoginRoutes } from './auth/devLogin.routes.js';
import { logoutRoutes } from './auth/logout.routes.js';
import { meRoutes } from './auth/me.routes.js';
import { sessionMiddleware } from './auth/sessionMiddleware.js';
import { emailAuthRoutes } from './emailAuth/emailAuth.routes.js';
import { errorMiddleware, notFoundHandler } from './errors/errorMiddleware.js';
import type { Env } from './env/index.js';
import { healthRoutes, healthzRoutes } from './health/health.routes.js';
import { instagramAuthRoutes } from './instagram/oauth.routes.js';
import { httpLogger } from './logging/httpLogger.js';
import { metaRoutes } from './meta/meta.routes.js';
import { onboardingRoutes } from './onboarding/onboarding.routes.js';
import type { PaymentsDeps } from './payments/types.js';
import { paymentRoutes } from './payments/payments.routes.js';
import { profileRoutes } from './profile/profile.routes.js';
import { payoutRoutes } from './payout/payout.routes.js';
import { type RazorpayClientOptions, createRazorpayClient } from './razorpay/client.js';
import { globalUserLimiter } from './rateLimit/limiters.js';
import {
  RAZORPAY_WEBHOOK_PATH,
  corsMiddleware,
  helmetMiddleware,
  jsonBodyMiddleware,
  metaUrlencodedBodyMiddleware,
  originCheck,
  webhookRawBodyMiddleware,
} from './security/index.js';
import { resumeRoutes } from './users/resume.routes.js';
import { createWebhookHandlers } from './webhooks/handlers/index.js';
import { razorpayWebhookRoutes } from './webhooks/razorpay.routes.js';

const META_CALLBACK_PATHS = ['/api/meta/deauthorize', '/api/meta/data-deletion'];

export interface AppOptions {
  /** Tests shorten the Razorpay retry delay; production uses the defaults. */
  razorpayClientOptions?: RazorpayClientOptions;
  /** Tests inject a clock for deadline checks and caches; production uses the real one. */
  now?: () => Date;
}

export function createApp(env: Env, options: AppOptions = {}): Express {
  const app = express();
  const ctx: ApiContext = { env, now: options.now ?? (() => new Date()) };
  const razorpay = createRazorpayClient(env, options.razorpayClientOptions);
  const paymentsDeps: PaymentsDeps = { env, razorpay, now: ctx.now };

  // Needed so IP-scoped rate limiters see the real client IP behind Render's proxy.
  app.set('trust proxy', 1);

  app.use(httpLogger);
  app.use(helmetMiddleware);
  app.use(corsMiddleware(env));

  // Reserves raw-body access for signature verification (a future prompt) —
  // must come before the global JSON parser below.
  app.use(RAZORPAY_WEBHOOK_PATH, webhookRawBodyMiddleware);
  // Meta posts signed_request as form-urlencoded, not JSON — same reasoning.
  app.use(META_CALLBACK_PATHS, metaUrlencodedBodyMiddleware);
  app.use(jsonBodyMiddleware);

  // Render's health check: before the Origin check, the session lookup and the global rate limiter,
  // which write to PostgreSQL. Nothing mounted above this line may query the database either.
  app.use(healthzRoutes());

  app.use(originCheck(env));
  app.use(sessionMiddleware(env, ctx.now));
  app.use('/api', globalUserLimiter);

  app.use(healthRoutes());
  app.use(configRoutes(ctx));
  app.use(meRoutes(ctx));
  app.use(onboardingRoutes(env));
  app.use(profileRoutes(ctx));
  app.use(payoutRoutes(ctx));
  app.use(dealRoutes(ctx));
  app.use(reviewRoutes(ctx));
  app.use(directPaymentRoutes(ctx));
  app.use(applicationRoutes(ctx));
  app.use(documentRoutes(ctx));
  app.use(disputeRoutes(ctx));
  app.use(adminRoutes(ctx));
  app.use(resumeRoutes(ctx));
  app.use(paymentRoutes(paymentsDeps));
  app.use(razorpayWebhookRoutes(env, createWebhookHandlers(env, paymentsDeps)));
  app.use(instagramAuthRoutes(env));
  app.use(metaRoutes(env));
  if (env.NODE_ENV !== 'production' && env.ENABLE_DEV_LOGIN) {
    app.use(devLoginRoutes(env));
  }
  if (env.AUTH_EMAIL_ENABLED) {
    app.use(emailAuthRoutes(env));
  }
  app.use(logoutRoutes(env));

  app.use(notFoundHandler);
  app.use(errorMiddleware);

  return app;
}
