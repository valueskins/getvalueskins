import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, makeNonce } from './lib/csp';
import { sentryDsn } from './lib/sentryDsn';

/**
 * Sets the Content Security Policy with a fresh nonce on every page (lib/csp.ts). Next.js
 * reads the nonce from the request's header and puts it on its own scripts, which is why
 * every page renders on request (app/layout.tsx).
 */
export function middleware(request: NextRequest) {
  const csp = buildCsp({
    nonce: makeNonce(),
    apiUrl: process.env.NEXT_PUBLIC_API_URL ?? '',
    dev: process.env.NODE_ENV === 'development',
    sentryDsn: sentryDsn(),
  });
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the built assets, images, the favicon, or link prefetches.
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
