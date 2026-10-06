import {
  meBillingSchema,
  meEmailSchema,
  meEmailVerifySchema,
  meInstagramUsernameSchema,
  meRoleSchema,
} from '@valueskins/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { requireRole, requireUser } from '../auth/guards.js';
import { db } from '../db/client.js';
import { brandBilling, users } from '../db/schema/index.js';
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

  router.post('/api/me/role', requireUser, async (req, res, next) => {
    try {
      const { role } = meRoleSchema.parse(req.body);

      // Conditional update: two racing requests cannot both set the role.
      const updated = await db
        .update(users)
        .set({ role, roleLockedAt: new Date() })
        .where(and(eq(users.id, req.user!.id), isNull(users.role)))
        .returning({ id: users.id });
      if (updated.length === 0) {
        throw new AppError(
          'ROLE_ALREADY_SET',
          409,
          'Your account type is already chosen and cannot be changed.',
        );
      }

      res.json({ onboarding: await completeOnboardingIfReady(req.user!.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/me/instagram-username', requireUser, async (req, res, next) => {
    try {
      const { username } = meInstagramUsernameSchema.parse(req.body);

      const updated = await db
        .update(users)
        .set({ username, instagramUsernameSetAt: new Date() })
        .where(and(eq(users.id, req.user!.id), isNull(users.instagramUserId)))
        .returning({ id: users.id });
      if (updated.length === 0) {
        throw new AppError(
          'INSTAGRAM_ALREADY_CONNECTED',
          409,
          'Your Instagram account is connected, so your username comes from Instagram.',
        );
      }

      res.json({ onboarding: await completeOnboardingIfReady(req.user!.id) });
    } catch (error) {
      next(error);
    }
  });

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
