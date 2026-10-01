import { notFound } from 'next/navigation';
import { isDevLoginEnabled } from '../../../../lib/temporary/flags';
import { DevLoginForm } from '../../_components/DevLoginForm';
import { headingClass } from '../../_components/styles';

// Exists only when NEXT_PUBLIC_ENABLE_DEV_LOGIN=true at build time; a build
// pointing at the production API with the flag set fails (lib/temporary/envGuard.ts).
export default function DevLoginPage() {
  if (!isDevLoginEnabled()) notFound();

  return (
    <div className="space-y-6">
      <h1 className={headingClass}>Dev login</h1>
      <p className="text-muted">Non-production only. Creates or logs in a fake user.</p>
      <DevLoginForm />
    </div>
  );
}
