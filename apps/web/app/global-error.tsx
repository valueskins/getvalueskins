'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/sentryInit';

// The app's colours, written out: when the root layout itself fails, its stylesheets may not load.
const INK = '#1a1612';
const MUTED = '#5c534b';
const ACCENT = '#c2410c';

/** Shown when the page itself fails to render. Plain on purpose: nothing else is trusted to work. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#fbf8f4',
          color: INK,
          fontFamily: 'system-ui, sans-serif',
          display: 'grid',
          placeItems: 'center',
          padding: '48px 24px',
          boxSizing: 'border-box',
        }}
      >
        <main style={{ maxWidth: 520, textAlign: 'center' }}>
          <p style={{ fontWeight: 700, fontSize: 22, margin: '0 0 24px' }}>
            Value<em style={{ fontFamily: 'Georgia, serif', color: ACCENT }}>Skins</em>
          </p>
          <h1 style={{ fontSize: 28, lineHeight: 1.2, margin: '0 0 12px' }}>
            Something went wrong
          </h1>
          <p style={{ color: MUTED, lineHeight: 1.5, margin: '0 0 24px' }}>
            Please reload the page. If it keeps happening, write to founder@valueskins.com and we
            will look into it.
          </p>
          <a
            href="/"
            style={{
              display: 'inline-block',
              padding: '12px 22px',
              borderRadius: 999,
              background: ACCENT,
              color: '#fff',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Go to the home page
          </a>
        </main>
      </body>
    </html>
  );
}
