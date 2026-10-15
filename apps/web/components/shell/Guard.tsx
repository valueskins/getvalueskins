'use client';

import { notFound, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import type { MeResponse } from '@valueskins/shared';
import { decideAccess, type Need } from '@/lib/access';
import { useMe } from '@/lib/api/queries';
import { errorText } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { PageSkeleton } from '@/components/ui/Skeleton';

interface GuardProps {
  need: Need;
  /** Rendered once access is decided. Gets GET /me (null on public pages when signed out). */
  children: (me: MeResponse | null) => ReactNode;
  fallback?: ReactNode;
}

/**
 * Keeps people on pages that fit their sign-in, onboarding and role
 * (lib/access.ts). The API still checks every request; this is navigation only.
 */
export function Guard({ need, children, fallback }: GuardProps) {
  const router = useRouter();
  const me = useMe();
  const decision = me.isSuccess ? decideAccess(me.data, need) : null;

  useEffect(() => {
    if (decision?.kind === 'redirect') router.replace(decision.to);
  }, [decision?.kind, decision?.kind === 'redirect' ? decision.to : null, router]);

  if (me.isError) {
    return (
      <div className="page">
        <Callout tone="error" title="We could not load your account" role="alert">
          <p>{errorText(me.error)}</p>
        </Callout>
        <Button variant="secondary" className="mt-4" onClick={() => void me.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!decision || decision.kind === 'redirect') return <>{fallback ?? <PageSkeleton />}</>;
  if (decision.kind === 'notFound') notFound();
  return <>{children(me.data ?? null)}</>;
}
