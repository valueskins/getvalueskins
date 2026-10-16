import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { captureError } from '../observability/sentry.js';
import { AppError } from './AppError.js';

/** A 5xx that is the expected answer in a state we chose (SPEC 19), not a fault to report. */
const EXPECTED_5XX = new Set(['PAYMENTS_NOT_OPEN']);

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
}

// Express requires exactly 4 params to recognize error middleware, so `_next`
// stays even though it's unused.
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.status >= 500 && !EXPECTED_5XX.has(err.code)) captureError(err, 'AppError 5xx');
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  req.log?.error({ err }, 'unhandled error');
  captureError(err, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
