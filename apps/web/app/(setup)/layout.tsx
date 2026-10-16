'use client';

import { Guard } from '@/components/shell/Guard';
import { SetupTopbar } from '@/components/shell/SetupTopbar';
import { SkipLink } from '@/components/shell/SkipLink';

/** Signed in, onboarding in any state: the plain top bar, no navigation yet. */
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <Guard need="setup">
      {(me) => (
        <div className="min-h-screen">
          <SkipLink />
          <SetupTopbar me={me!} />
          <main id="main">{children}</main>
        </div>
      )}
    </Guard>
  );
}
