'use client';

import { Suspense } from 'react';
import { VerifyEmail } from '@/components/onboarding/VerifyEmail';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  );
}
