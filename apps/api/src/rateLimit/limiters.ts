import { PUBLISH_LIMIT_MESSAGE } from '@valueskins/shared';
import type { Request } from 'express';
import { createKeyedLimiter, createRateLimiter } from './factory.js';

/** SPEC 13: 100 per minute, per user (falling back to IP for anonymous requests). */
export const globalUserLimiter = createRateLimiter({
  points: 100,
  duration: 60,
  keyPrefix: 'user',
  keyFn: (req: Request) => req.user?.id ?? `ip:${req.ip}`,
});

/**
 * SPEC 13's two IP-scoped rows. Built and exported, but not yet attached to
 * any route: the real signup/login endpoints they gate don't exist yet.
 * dev-login is a dev/test bypass, not that endpoint — deliberately not
 * rate-limited by loginIpLimiter, so it doesn't break local dev/test loops.
 */
export const signupIpLimiter = createRateLimiter({
  points: 5,
  duration: 60 * 60,
  keyPrefix: 'signup',
  keyFn: (req: Request) => req.ip ?? 'unknown',
});

export const loginIpLimiter = createRateLimiter({
  points: 20,
  duration: 60 * 60,
  blockDuration: 15 * 60,
  keyPrefix: 'login',
  keyFn: (req: Request) => req.ip ?? 'unknown',
});

/** SPEC 13: email verification resend, 5 per hour per user. */
export const emailVerificationLimiter = createRateLimiter({
  points: 5,
  duration: 60 * 60,
  keyPrefix: 'email-verification',
  keyFn: (req: Request) => req.user?.id ?? `ip:${req.ip}`,
});

/** SPEC 13: publish deal, 10 per 24 hours per brand. Consumed by the handler once the draft is valid. */
export const consumePublishDealLimit = createKeyedLimiter({
  points: 10,
  duration: 24 * 60 * 60,
  keyPrefix: 'publish-deal',
  error: { code: 'PUBLISH_LIMIT', message: PUBLISH_LIMIT_MESSAGE },
});

/** SPEC 13: apply, 20 per 24 hours per creator. Consumed by the handler once the application is allowed. */
export const consumeApplyLimit = createKeyedLimiter({
  points: 20,
  duration: 24 * 60 * 60,
  keyPrefix: 'apply',
});

/** SPEC 13: saving the profile details, 10 per hour per user. */
export const profileLimiter = createRateLimiter({
  points: 10,
  duration: 60 * 60,
  keyPrefix: 'profile',
  keyFn: (req: Request) => req.user?.id ?? `ip:${req.ip}`,
});

/** SPEC 13: saving payout UPI details, 10 per hour per creator. */
export const payoutUpiLimiter = createRateLimiter({
  points: 10,
  duration: 60 * 60,
  keyPrefix: 'payout-upi',
  keyFn: (req: Request) => req.user?.id ?? `ip:${req.ip}`,
});

/** SPEC 13: dispute, 3 per deal per 24 hours per user. Key it `${userId}:${dealId}`. */
export const consumeDisputeLimit = createKeyedLimiter({
  points: 3,
  duration: 24 * 60 * 60,
  keyPrefix: 'dispute',
});

/** SPEC 13: recording a direct payment, 10 per hour per brand. */
export const directPaymentRecordLimiter = createRateLimiter({
  points: 10,
  duration: 60 * 60,
  keyPrefix: 'direct-payment-record',
  keyFn: (req: Request) => req.user?.id ?? `ip:${req.ip}`,
});

/** SPEC 13: confirming a direct payment or saying it did not arrive, 20 per hour per creator. */
export const directPaymentDecisionLimiter = createRateLimiter({
  points: 20,
  duration: 60 * 60,
  keyPrefix: 'direct-payment-decision',
  keyFn: (req: Request) => req.user?.id ?? `ip:${req.ip}`,
});
