import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { getCookie } from '../auth/cookies.js';
import type { Env } from '../env/index.js';

export const IG_OAUTH_STATE_COOKIE = 'vs_ig_oauth_state';
const STATE_TTL_MS = 5 * 60 * 1000;

export interface OAuthStatePayload {
  nonce: string;
  mode: 'login' | 'link';
  linkUserId?: string;
  issuedAt: number;
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function encode(payload: OAuthStatePayload, secret: string): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = sign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

function decode(value: string, secret: string): OAuthStatePayload | null {
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts as [string, string];

  const expectedSig = sign(payloadB64, secret);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof payload.nonce !== 'string' ||
      (payload.mode !== 'login' && payload.mode !== 'link') ||
      typeof payload.issuedAt !== 'number'
    ) {
      return null;
    }
    return payload as OAuthStatePayload;
  } catch {
    return null;
  }
}

export interface SetStateInput {
  mode: 'login' | 'link';
  linkUserId?: string;
}

/** Signs a fresh state, sets it as a short-lived cookie, and returns the
 * nonce to send as the OAuth `state` query param (double-submit defense). */
export function setOAuthStateCookie(res: Response, env: Env, input: SetStateInput): string {
  const nonce = randomBytes(16).toString('base64url');
  const payload: OAuthStatePayload = {
    nonce,
    mode: input.mode,
    linkUserId: input.linkUserId,
    issuedAt: Date.now(),
  };
  const value = encode(payload, env.SESSION_SECRET);

  res.cookie(IG_OAUTH_STATE_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    domain: env.COOKIE_DOMAIN || undefined,
    path: '/api/auth/instagram',
    maxAge: STATE_TTL_MS,
  });

  return nonce;
}

export function clearOAuthStateCookie(res: Response, env: Env): void {
  res.clearCookie(IG_OAUTH_STATE_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    domain: env.COOKIE_DOMAIN || undefined,
    path: '/api/auth/instagram',
  });
}

/** Verifies the cookie's signature, freshness, and that it matches the
 * `state` query param the callback received. Returns null on any failure. */
export function verifyOAuthState(req: Request, env: Env): OAuthStatePayload | null {
  const cookieValue = getCookie(req, IG_OAUTH_STATE_COOKIE);
  if (!cookieValue) return null;

  const payload = decode(cookieValue, env.SESSION_SECRET);
  if (!payload) return null;

  if (Date.now() - payload.issuedAt > STATE_TTL_MS) return null;

  const queryState = req.query.state;
  if (typeof queryState !== 'string' || queryState !== payload.nonce) return null;

  return payload;
}
