'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { reportError } from '@/lib/sentryInit';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SiteFooter, SiteHeader } from '@/components/shell/SiteChrome';
import { useSupportAddress } from '@/components/shell/SupportEmail';

/** A page that failed to render, inside the app's frame: try again, or go home. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const email = useSupportAddress();
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="status-page">
        <section className="status-card" role="alert" aria-labelledby="error-title">
          <span className="status-icon status-icon-error" aria-hidden="true">
            <Icon name="warningCircle" size={24} />
          </span>
          <h1 id="error-title" className="t-h1">
            Something went wrong
          </h1>
          <p className="t-body c-ink-2">
            This page did not load. Try again. If it keeps happening, write to{' '}
            <a href={`mailto:${email}`}>{email}</a> and say what you were doing.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={reset}>Try again</Button>
            <Link href="/" className="btn btn-secondary">
              Go to the home page
            </Link>
          </div>
          {error.digest ? <p className="t-small c-ink-3">Reference {error.digest}</p> : null}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
