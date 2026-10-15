'use client';

import { Guard } from '@/components/shell/Guard';
import { AppShell } from '@/components/shell/AppShell';

/** Signed in and onboarded: the shell with the role navigation. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Guard need="app">{(me) => <AppShell me={me!}>{children}</AppShell>}</Guard>;
}
