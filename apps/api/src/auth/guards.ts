import type { NextFunction, Request, Response } from 'express';
import {
  CONNECT_INSTAGRAM_TO_CONTINUE,
  ONLY_BRANDS_CAN,
  ONLY_CREATORS_CAN,
  type UserRole,
} from '@valueskins/shared';
import { AppError } from '../errors/AppError.js';

/** Marks a middleware with a name the route audit test can read (an arrow function has none). */
export function tagged<T extends (...args: never[]) => unknown>(fn: T, guard: string): T {
  return Object.assign(fn, { guard });
}

/** The tag of a guard or limiter, or the function's own name. */
export function guardName(fn: unknown): string {
  const tag = (fn as { guard?: unknown }).guard;
  return typeof tag === 'string' ? tag : ((fn as { name?: string }).name ?? '');
}

export function requireUser(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new AppError('UNAUTHENTICATED', 401, 'Sign in required'));
    return;
  }
  next();
}

export function requireRole(role: UserRole) {
  return tagged((req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('UNAUTHENTICATED', 401, 'Sign in required'));
      return;
    }
    if (req.user.role === null) {
      next(new AppError('INSTAGRAM_NOT_CONNECTED', 403, CONNECT_INSTAGRAM_TO_CONTINUE));
      return;
    }
    if (req.user.role !== role) {
      next(new AppError('WRONG_ROLE', 403, role === 'BRAND' ? ONLY_BRANDS_CAN : ONLY_CREATORS_CAN));
      return;
    }
    next();
  }, `role:${role}`);
}

export function requireOnboarded(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new AppError('UNAUTHENTICATED', 401, 'Sign in required'));
    return;
  }
  if (!req.user.onboardingCompletedAt) {
    next(new AppError('ONBOARDING_INCOMPLETE', 403, 'Complete onboarding before continuing'));
    return;
  }
  next();
}

/** 404, not 401/403, for non-admins — SPEC 20: "Admin routes return 404 to non-admins." */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !req.user.isAdmin) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    return;
  }
  next();
}
