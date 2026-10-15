'use client';

import type { ReactNode } from 'react';
import type { UserRole } from '@valueskins/shared';
import { Guard } from './Guard';

/** A page for one role. Anyone else gets the 404 page. */
export function RolePage({ role, children }: { role: UserRole; children: ReactNode }) {
  return <Guard need={role}>{() => children}</Guard>;
}
