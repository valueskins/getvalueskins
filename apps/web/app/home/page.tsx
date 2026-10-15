'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { homePathFor } from '@/lib/access';
import { useMe } from '@/lib/api/queries';
import { PageSkeleton } from '@/components/ui/Skeleton';

/**
 * The API sends a finished sign-in here (SPEC 6.1). Each person starts on their
 * own page: creators on Deals, brands on Campaigns, unfinished setup on onboarding.
 */
export default function HomeRedirect() {
  const router = useRouter();
  const me = useMe();
  useEffect(() => {
    if (me.isSuccess) router.replace(me.data ? homePathFor(me.data) : '/');
    if (me.isError) router.replace('/');
  }, [me.isSuccess, me.isError, me.data, router]);
  return <PageSkeleton />;
}
