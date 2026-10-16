'use client';

import { errorText } from '@/lib/api/errors';
import { Button } from './Button';
import { Callout } from './Callout';

/** A read that failed: what did not load, the reason in plain words, and Try again. */
export function LoadError({
  title,
  error,
  onRetry,
  className,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <Callout tone="error" title={title} role="alert">
        <p>{errorText(error)}</p>
      </Callout>
      <Button variant="secondary" className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
