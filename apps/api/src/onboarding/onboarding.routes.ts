import {
  meBillingSchema,
  meEmailSchema,
  meEmailVerifySchema,
  type BillingView,
} from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { requireRole, requireUser } from '../auth/guards.js';
import { db } from '../db/client.js';
import { brandBilling } from '../db/schema/index.js';
import { normalizeEmail } from '../emailAuth/codes.js';
import type { Env } from '../env/index.js';
import { AppError } from '../errors/AppError.js';
import { emailVerificationLimiter, emailVerifyLimiter } from '../rateLimit/limiters.js';
import {
  findPendingEmail,
  issueEmailVerification,
  verifyEmailToken,
} from './emailVerification.service.js';
import { completeOnboardingIfReady } from './onboarding.service.js';

/** A brand's saved billing details as the API shows them, or null when none are saved. */
async function loadBilling(userId: string): Promise<BillingView | null> {
  const [row] = await db
    .select()
    .from(brandBilling)
    .where(eq(brandBilling.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    billingName: row.billingName,
    billingAddress: row.billingAddress,
    billingState: row.billingState,
    gstin: row.gstin,
  };
}

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

  // Public (SPEC 6.4): the emailed token alone proves the address, so the link works in a browser
  // that is not signed in. The token decides which user is verified, never the session, and this
  // route never creates a session. The onboarding state comes back only to that user's own session.
  router.post('/api/me/email/verify', emailVerifyLimiter, async (req, res, next) => {
    try {
      const { token } = meEmailVerifySchema.parse(req.body);
      const verified = await verifyEmailToken(token);
      const onboarding = await completeOnboardingIfReady(verified.userId);
      res.json({
        verified: true,
        email: verified.email,
        onboarding: req.user?.id === verified.userId ? onboarding : null,
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/me/billing (SPEC 16): the saved billing details, or null before the brand saves any.
  router.get('/api/me/billing', requireRole('BRAND'), async (req, res, next) => {
    try {
      res.json({ billing: await loadBilling(req.user!.id) });
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

      res.json({
        billing: await loadBilling(req.user!.id),
        onboarding: await completeOnboardingIfReady(req.user!.id),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
