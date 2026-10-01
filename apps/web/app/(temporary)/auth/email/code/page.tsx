import { Suspense } from 'react';
import { EmailCodeForm } from '../../../_components/EmailCodeForm';
import { headingClass } from '../../../_components/styles';

export default function EmailCodePage() {
  return (
    <div className="space-y-6">
      <h1 className={headingClass}>Enter your code</h1>
      <Suspense fallback={null}>
        <EmailCodeForm />
      </Suspense>
    </div>
  );
}
