'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { SignInError } from '@/components/public/SignInError';

/**
 * The API's Instagram callback sends failed sign-ins here with ?error=<code>
 * (SPEC 6.1). Sign-in itself starts on the home page, so a bare /login goes there.
 */
function LoginPage() {
  const router = useRouter();
  const code = useSearchParams()?.get('error') ?? null;

  useEffect(() => {
    if (code === null) router.replace('/');
  }, [code, router]);

  if (code === null) return null;
  return <SignInError code={code} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
