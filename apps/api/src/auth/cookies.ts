import type { Request, Response } from 'express';
import type { Env } from '../env/index.js';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** No cookie-parsing dependency: reading req.headers.cookie is this simple. */
export function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

function cookieOptions(env: Env, maxAge: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    domain: env.COOKIE_DOMAIN || undefined,
    path: '/',
    maxAge,
  };
}

export function setSessionCookie(res: Response, env: Env, token: string): void {
  res.cookie(env.SESSION_COOKIE_NAME, token, cookieOptions(env, SESSION_TTL_MS));
}

export function clearSessionCookie(res: Response, env: Env): void {
  res.clearCookie(env.SESSION_COOKIE_NAME, cookieOptions(env, 0));
}
