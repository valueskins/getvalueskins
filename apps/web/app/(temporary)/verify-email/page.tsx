import { Suspense } from 'react';
import { VerifyEmailView } from '../_components/VerifyEmailView';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailView />
    </Suspense>
  );
}
