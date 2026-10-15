'use client';

import { Guard } from '@/components/shell/Guard';
import { AppShell } from '@/components/shell/AppShell';
import { RealtimeProvider } from '@/components/realtime/RealtimeProvider';

/** Signed in and onboarded: the shell with the role navigation, and live updates. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Guard need="app">
      {(me) => (
        <RealtimeProvider>
          <AppShell me={me!}>{children}</AppShell>
        </RealtimeProvider>
      )}
    </Guard>
  );
}
