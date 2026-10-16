'use client';

import { notFound, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import type { MeResponse } from '@valueskins/shared';
import { decideAccess, type Need } from '@/lib/access';
import { useMe } from '@/lib/api/queries';
import { LoadError } from '@/components/ui/LoadError';
import { PageSkeleton } from '@/components/ui/Skeleton';

/**
 * Keeps an Instagram ?error= code when unfinished setup is sent to onboarding,
 * so a failed "Connect Instagram" still says why (the API sends it to /settings).
 */
function withSignInError(target: string): string {
  if (target !== '/onboarding' || typeof window === 'undefined') return target;
  const error = new URLSearchParams(window.location.search).get('error');
  return error ? `${target}?error=${encodeURIComponent(error)}` : target;
}

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

  const target = decision?.kind === 'redirect' ? decision.to : null;
  useEffect(() => {
    if (target) router.replace(withSignInError(target));
  }, [target, router]);

  if (me.isError) {
    return (
      <LoadError
        className="page"
        title="We could not load your account"
        error={me.error}
        onRetry={() => void me.refetch()}
      />
    );
  }
  if (!decision || decision.kind === 'redirect') return <>{fallback ?? <PageSkeleton />}</>;
  if (decision.kind === 'notFound') notFound();
  return <>{children(me.data ?? null)}</>;
}
