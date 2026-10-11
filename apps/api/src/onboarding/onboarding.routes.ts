import { meBillingSchema, meEmailSchema, meEmailVerifySchema } from '@valueskins/shared';
import { Router } from 'express';
import { requireRole, requireUser } from '../auth/guards.js';
import { db } from '../db/client.js';
import { brandBilling } from '../db/schema/index.js';
import { normalizeEmail } from '../emailAuth/codes.js';
import type { Env } from '../env/index.js';
import { AppError } from '../errors/AppError.js';
import { emailVerificationLimiter } from '../rateLimit/limiters.js';
import {
  findPendingEmail,
  issueEmailVerification,
  verifyEmailToken,
} from './emailVerification.service.js';
import { completeOnboardingIfReady } from './onboarding.service.js';

/** SPEC 6.4 and 16: the onboarding steps. Every route answers with the fresh onboarding state. */
export function onboardingRoutes(env: Env): Router {
  const router = Router();

  router.post('/api/me/email', requireUser, emailVerificationLimiter, async (req, res, next) => {
    try {
      const user = req.user!;
      if (user.instagramUserId === null) {
        throw new AppError('EMAIL_IS_SIGN_IN', 409, 'Your email address is how you sign in.');
      }

      const { email: rawEmail } = meEmailSchema.parse(req.body);
      const email = normalizeEmail(rawEmail);
      if (user.email === email && user.emailVerifiedAt) {
        throw new AppError('EMAIL_UNCHANGED', 409, 'This email address is already verified.');
      }

      // Always the same answer: whether the address belongs to another account
      // is only reported when the link is used.
      await issueEmailVerification(env, user.id, email);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/api/me/email/resend',
    requireUser,
    emailVerificationLimiter,
    async (req, res, next) => {
      try {
        const pending = await findPendingEmail(req.user!.id);
        if (!pending) {
          throw new AppError('NO_PENDING_EMAIL', 409, 'There is no email waiting to be verified.');
        }
        await issueEmailVerification(env, req.user!.id, pending);
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post('/api/me/email/verify', requireUser, async (req, res, next) => {
    try {
      const { token } = meEmailVerifySchema.parse(req.body);
      await verifyEmailToken(req.user!.id, token);
      res.json({ onboarding: await completeOnboardingIfReady(req.user!.id) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/api/me/billing', requireRole('BRAND'), async (req, res, next) => {
    try {
      const input = meBillingSchema.parse(req.body);
      const values = {
        billingName: input.billingName,
        billingAddress: input.billingAddress,
        billingState: input.billingState,
        gstin: input.gstin ?? null,
      };

      await db
        .insert(brandBilling)
        .values({ userId: req.user!.id, ...values })
        .onConflictDoUpdate({ target: brandBilling.userId, set: values });

      res.json({ onboarding: await completeOnboardingIfReady(req.user!.id) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
