// The Content Security Policy for every page (SPEC 18, 20). The only third parties are
// Razorpay Checkout and Sentry, and Sentry only as the exact host of the DSN. Instagram profile pictures and the API are the app's own data.
//
// Razorpay does not publish a CSP list. The hosts below are the ones
// https://checkout.razorpay.com/v1/checkout.js loads, calls or frames, checked by opening
// Checkout with this policy in place and reading the browser's violation reports.

import { sentryIngestOrigin } from './sentryDsn';

export const RAZORPAY = {
  /** The Checkout loader (lib/razorpay.ts), and the risk check script it adds to the page. */
  script: ['https://checkout.razorpay.com', 'https://cdn.razorpay.com'],
  /** The payment form runs in a frame served from the API host. */
  frame: ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
  /** Checkout's calls from the page: the API and its event logging. */
  connect: [
    'https://api.razorpay.com',
    'https://lumberjack.razorpay.com',
    'https://lumberjack-cx.razorpay.com',
    'https://lumberjack-metrics.razorpay.com',
  ],
  /** Payment method logos. */
  img: ['https://cdn.razorpay.com'],
};

/** Instagram profile pictures (the Avatar falls back to a letter if one is blocked). */
export const INSTAGRAM_IMAGES = ['https://*.cdninstagram.com', 'https://*.fbcdn.net'];

/** The API's origin, and the same host as a WebSocket origin for Socket.io. */
export function apiOrigins(apiUrl: string): string[] {
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    return [];
  }
  const ws = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return [url.origin, `${ws}//${url.host}`];
}

export interface CspInput {
  nonce: string;
  /** NEXT_PUBLIC_API_URL. */
  apiUrl: string;
  /** `next dev`: React's dev tools need eval. */
  dev: boolean;
  /** NEXT_PUBLIC_SENTRY_DSN. Only its own host is allowed; unset means no Sentry host at all. */
  sentryDsn?: string;
}

/** The policy as one header value. */
export function buildCsp({ nonce, apiUrl, dev, sentryDsn }: CspInput): string {
  const api = apiOrigins(apiUrl);
  const sentry = sentryIngestOrigin(sentryDsn);
  const directives: Array<[string, ...string[]]> = [
    ['default-src', "'self'"],
    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      ...RAZORPAY.script,
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    // React writes style attributes into the server HTML, and a nonce cannot cover attributes.
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:', ...INSTAGRAM_IMAGES, ...RAZORPAY.img],
    ['font-src', "'self'"],
    ['connect-src', "'self'", ...api, ...RAZORPAY.connect, ...(sentry ? [sentry] : [])],
    ['frame-src', ...RAZORPAY.frame],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ];
  // Only where the API itself is https, so a local build against http://localhost still works.
  if (!dev && apiUrl.startsWith('https://')) directives.push(['upgrade-insecure-requests']);
  return directives.map((d) => d.join(' ')).join('; ');
}

/** A fresh, unguessable nonce for one response. */
export function makeNonce(): string {
  return btoa(crypto.randomUUID());
}
