import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@valueskins/shared';
import { AppError } from '../errors/AppError.js';

export function requireUser(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new AppError('UNAUTHENTICATED', 401, 'Sign in required'));
    return;
  }
  next();
}

export function requireRole(role: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('UNAUTHENTICATED', 401, 'Sign in required'));
      return;
    }
    if (req.user.role === null) {
      next(new AppError('ROLE_NOT_CHOSEN', 403, 'Choose a role before continuing'));
      return;
    }
    if (req.user.role !== role) {
      next(new AppError('WRONG_ROLE', 403, `This action requires the ${role} role`));
      return;
    }
    next();
  };
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
