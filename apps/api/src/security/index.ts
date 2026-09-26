import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import type { Env } from '../env/index.js';

/** Reserved for signature verification in a future prompt — no handler mounted yet. */
export const RAZORPAY_WEBHOOK_PATH = '/api/webhooks/razorpay';

export const helmetMiddleware: RequestHandler = helmet();

export function corsMiddleware(env: Env): RequestHandler {
  return cors({ origin: env.WEB_ORIGIN, credentials: true });
}

/** Must be mounted before the global JSON parser: body-parsers no-op once a
 * body has already been parsed, so this reserves raw-body access on this
 * exact path ahead of the global express.json() below. */
export const webhookRawBodyMiddleware: RequestHandler = express.raw({
  type: 'application/json',
});

export const jsonBodyMiddleware: RequestHandler = express.json({ limit: '1mb' });

export { originCheck, ORIGIN_CHECK_EXEMPT_PATH_PREFIXES } from './originCheck.js';
