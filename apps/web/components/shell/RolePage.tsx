'use client';

import type { ReactNode } from 'react';
import type { UserRole } from '@valueskins/shared';
import { Guard } from './Guard';

/** A page for one role. Anyone else gets the 404 page. */
export function RolePage({ role, children }: { role: UserRole; children: ReactNode }) {
  return <Guard need={role}>{() => children}</Guard>;
}

/**
 * The heading and intro line of a page whose content arrives with the deal
 * screens (W2). It gives the navigation and /home somewhere to land.
 */
export function PageIntro({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children?: ReactNode;
}) {
  return (
    <div className="page">
      <div className="page-head">
        <div className="flex flex-col gap-1">
          <h1 className="t-h1">{title}</h1>
          <p className="t-body c-ink-2">{lede}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
