import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  IG_OAUTH_STATE_COOKIE,
  clearOAuthStateCookie,
  setOAuthStateCookie,
  verifyOAuthState,
} from '../../src/instagram/state.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();

function fakeRes() {
  let cookieValue: string | undefined;
  return {
    cookie: vi.fn((_name: string, value: string) => {
      cookieValue = value;
    }),
    clearCookie: vi.fn(() => {
      cookieValue = undefined;
    }),
    get cookieValue() {
      return cookieValue;
    },
  };
}

function fakeReq(cookieValue: string | undefined, queryState: string | undefined): Request {
  return {
    headers: { cookie: cookieValue ? `${IG_OAUTH_STATE_COOKIE}=${cookieValue}` : undefined },
    query: { state: queryState },
  } as unknown as Request;
}

describe('instagram OAuth state cookie', () => {
  it('round trips a login-mode state', () => {
    const res = fakeRes();
    const nonce = setOAuthStateCookie(res as never, env, { mode: 'login' });

    const req = fakeReq(res.cookieValue, nonce);
    const payload = verifyOAuthState(req, env);

    expect(payload).not.toBeNull();
    expect(payload?.mode).toBe('login');
    expect(payload?.nonce).toBe(nonce);
  });

  it('round trips a link-mode state, preserving linkUserId', () => {
    const res = fakeRes();
    const nonce = setOAuthStateCookie(res as never, env, { mode: 'link', linkUserId: 'user-123' });

    const req = fakeReq(res.cookieValue, nonce);
    const payload = verifyOAuthState(req, env);

    expect(payload?.mode).toBe('link');
    expect(payload?.linkUserId).toBe('user-123');
  });

  it('rejects when the query state does not match the cookie nonce', () => {
    const res = fakeRes();
    setOAuthStateCookie(res as never, env, { mode: 'login' });

    const req = fakeReq(res.cookieValue, 'a-different-nonce');
    expect(verifyOAuthState(req, env)).toBeNull();
  });

  it('rejects a tampered cookie signature', () => {
    const res = fakeRes();
    const nonce = setOAuthStateCookie(res as never, env, { mode: 'login' });

    const [payloadB64] = res.cookieValue!.split('.');
    const tampered = `${payloadB64}.tampered-signature`;

    const req = fakeReq(tampered, nonce);
    expect(verifyOAuthState(req, env)).toBeNull();
  });

  it('rejects a missing cookie', () => {
    const req = fakeReq(undefined, 'some-nonce');
    expect(verifyOAuthState(req, env)).toBeNull();
  });

  it('rejects an expired state', () => {
    vi.useFakeTimers();
    try {
      const res = fakeRes();
      const nonce = setOAuthStateCookie(res as never, env, { mode: 'login' });

      vi.advanceTimersByTime(6 * 60 * 1000);

      const req = fakeReq(res.cookieValue, nonce);
      expect(verifyOAuthState(req, env)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clearOAuthStateCookie clears the cookie', () => {
    const res = fakeRes();
    setOAuthStateCookie(res as never, env, { mode: 'login' });
    clearOAuthStateCookie(res as never, env);
    expect(res.cookieValue).toBeUndefined();
  });
});
