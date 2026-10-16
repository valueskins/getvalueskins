'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/sentryInit';

/** Shown when the page itself fails to render. Plain on purpose: nothing else is trusted to work. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '48px 24px', maxWidth: 680 }}>
        <h1>Something went wrong</h1>
        <p>Please reload the page. If it keeps happening, write to us and we will look into it.</p>
      </body>
    </html>
  );
}
