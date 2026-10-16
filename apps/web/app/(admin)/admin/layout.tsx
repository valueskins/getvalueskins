'use client';

import { Guard } from '@/components/shell/Guard';
import { AdminShell } from '@/components/shell/AdminShell';

/** Admins only (SPEC 12). Everyone else, signed out included, gets the 404 page. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Guard need="admin">{(me) => <AdminShell me={me!}>{children}</AdminShell>}</Guard>;
}
