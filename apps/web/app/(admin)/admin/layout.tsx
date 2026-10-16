'use client';

import { Guard } from '@/components/shell/Guard';
import { AdminShell } from '@/components/shell/AdminShell';
import { RealtimeProvider } from '@/components/realtime/RealtimeProvider';

/**
 * Admins only (SPEC 12). Everyone else, signed out included, gets the 404 page. Live updates as on
 * the signed-in pages: an admin may join any deal room (SPEC 10).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Guard need="admin">
      {(me) => (
        <RealtimeProvider>
          <AdminShell me={me!}>{children}</AdminShell>
        </RealtimeProvider>
      )}
    </Guard>
  );
}
