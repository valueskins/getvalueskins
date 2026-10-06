import type { Request } from 'express';
import { createRateLimiter } from './factory.js';

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
