'use client';

import { Suspense } from 'react';
import { useMe } from '@/lib/api/queries';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { PageSkeleton } from '@/components/ui/Skeleton';

function Onboarding() {
  const me = useMe();
  // The setup layout has already checked the session.
  if (!me.data) return <PageSkeleton />;
  return <OnboardingFlow me={me.data} />;
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Onboarding />
    </Suspense>
  );
}
