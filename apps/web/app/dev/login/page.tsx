import { notFound } from 'next/navigation';
import { isDevLoginEnabled } from '@/lib/env';
import { DevLoginForm } from '@/components/dev/DevLoginForm';
import { SiteHeader } from '@/components/shell/SiteChrome';

/**
 * Dev login (SPEC 6.2). A 404 unless NEXT_PUBLIC_ENABLE_DEV_LOGIN is "true",
 * and next.config.ts refuses to build with that flag against the production API.
 */
export default function DevLoginPage() {
  if (!isDevLoginEnabled()) notFound();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main
        id="main"
        className="mx-auto flex max-w-[520px] flex-col gap-6 px-4 pb-20 pt-10 md:pt-16"
      >
        <div className="flex flex-col gap-2">
          <span className="badge badge-wait self-start">Not in production</span>
          <h1 className="t-h1">Dev login</h1>
          <p className="t-body c-ink-2">
            Signs in as a test user without Instagram. Works only where the API has
            ENABLE_DEV_LOGIN=true.
          </p>
        </div>
        <DevLoginForm />
      </main>
    </div>
  );
}
