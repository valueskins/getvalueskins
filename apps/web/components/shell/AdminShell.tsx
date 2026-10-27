'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { MeResponse } from '@valueskins/shared';
import { cx } from '@/components/ui/cx';
import { ADMIN_NAV, isActive, MobileMenu, UserMenu } from './AppShell';
import { SkipLink } from './SkipLink';
import { Wordmark } from './Wordmark';

function AdminMark() {
  return (
    <span className="flex items-center gap-2.5">
      <Link href={ADMIN_NAV[0]!.href} className="wordmark-link" aria-label="ValueSkins, admin home">
        <Wordmark />
      </Link>
      <span className="admin-tag">Admin</span>
    </span>
  );
}

/** The admin shell: plainer and denser. Deals and Disputes, an Admin tag, and Sign out. */
export function AdminShell({ me, children }: { me: MeResponse; children: ReactNode }) {
  const pathname = usePathname() ?? '';
  return (
    <div className="admin-frame">
      <SkipLink />
      <header className="topbar hidden md:block">
        <div className="topbar-in">
          <AdminMark />
          <nav className="nav" aria-label="Admin">
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cx('nav-link', isActive(pathname, item.href) && 'is-active')}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="topbar-right">
            <UserMenu me={me} roleLabel="Admin" links={[]} />
          </div>
        </div>
      </header>
      <header className="topbar-m md:hidden">
        <AdminMark />
        <MobileMenu
          me={me}
          nav={ADMIN_NAV}
          pathname={pathname}
          roleLabel="Admin"
          links={[]}
          label="Admin"
        />
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
