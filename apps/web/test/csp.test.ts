// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from '@/middleware';
import { apiOrigins, buildCsp } from '@/lib/csp';

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split('; ').map((d) => {
      const [name, ...values] = d.split(' ');
      return [name!, values];
    }),
  );
}

const STAGING = 'https://api-staging.valueskins.com';

describe('the CSP', () => {
  const csp = directives(buildCsp({ nonce: 'TESTNONCE', apiUrl: STAGING, dev: false }));

  it('runs only our own scripts with the nonce, and Razorpay Checkout', () => {
    expect(csp.get('script-src')).toEqual([
      "'self'",
      "'nonce-TESTNONCE'",
      'https://checkout.razorpay.com',
      'https://cdn.razorpay.com',
    ]);
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
    expect(csp.has('upgrade-insecure-requests')).toBe(true);
  });

  it('connects to the API (https and wss), Razorpay and Sentry only', () => {
    const connect = csp.get('connect-src')!;
    expect(connect).toContain(STAGING);
    expect(connect).toContain('wss://api-staging.valueskins.com');
    for (const host of connect.filter((h) => h.startsWith('https://') && h !== STAGING)) {
      expect(host).toMatch(/^https:\/\/[a-z0-9*.-]+\.(razorpay\.com|sentry\.io)$/);
    }
    expect(connect.some((h) => h.includes('sentry.io'))).toBe(true);
  });

  it('frames only Razorpay, and loads images only from Instagram and Razorpay', () => {
    expect(csp.get('frame-src')!.every((h) => h.endsWith('.razorpay.com'))).toBe(true);
    const thirdParty = csp.get('img-src')!.filter((h) => h.startsWith('https://'));
    for (const host of thirdParty) {
      expect(host).toMatch(/(cdninstagram\.com|fbcdn\.net|razorpay\.com)$/);
    }
  });

  it('never allows inline or eval scripts in a build, nor a wildcard source', () => {
    const all = [...csp.values()].flat();
    expect(csp.get('script-src')).not.toContain("'unsafe-inline'");
    expect(all).not.toContain("'unsafe-eval'");
    expect(all).not.toContain('*');
    expect(all).not.toContain('https:');
  });

  it("adds 'unsafe-eval' in development only, and keeps http locally", () => {
    const dev = directives(buildCsp({ nonce: 'N', apiUrl: 'http://localhost:4000', dev: true }));
    expect(dev.get('script-src')).toContain("'unsafe-eval'");
    expect(dev.get('connect-src')).toContain('ws://localhost:4000');
    expect(dev.has('upgrade-insecure-requests')).toBe(false);
    const localBuild = directives(
      buildCsp({ nonce: 'N', apiUrl: 'http://localhost:4000', dev: false }),
    );
    expect(localBuild.has('upgrade-insecure-requests')).toBe(false);
  });

  it('leaves the API out when its URL is not set', () => {
    expect(apiOrigins('')).toEqual([]);
  });
});

describe('the CSP middleware', () => {
  it('sets the policy with a fresh nonce on the response and for the page render', () => {
    const first = middleware(new NextRequest('http://localhost/deals'));
    const second = middleware(new NextRequest('http://localhost/deals'));
    const a = first.headers.get('Content-Security-Policy')!;
    const b = second.headers.get('Content-Security-Policy')!;
    const nonce = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce(a)).toBeTruthy();
    expect(nonce(a)!.length).toBeGreaterThanOrEqual(24);
    expect(nonce(a)).not.toBe(nonce(b));
    // Next.js passes the request header on to the render, where it reads the nonce.
    expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(a);
  });
});
