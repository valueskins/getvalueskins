'use client';

import { Guard } from '@/components/shell/Guard';
import { SetupTopbar } from '@/components/shell/SetupTopbar';

/** Signed in, onboarding in any state: the plain top bar, no navigation yet. */
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <Guard need="setup">
      {(me) => (
        <div className="min-h-screen">
          <SetupTopbar me={me!} />
          {children}
        </div>
      )}
    </Guard>
  );
}
