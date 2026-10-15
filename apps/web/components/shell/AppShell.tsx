'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { MeResponse } from '@valueskins/shared';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/cx';
import { useSignOut } from './useSignOut';

interface NavItem {
  href: string;
  label: string;
}

const CREATOR_NAV: NavItem[] = [
  { href: '/deals', label: 'Deals' },
  { href: '/applications', label: 'Applications' },
  { href: '/my-deals', label: 'My deals' },
  { href: '/settings', label: 'Settings' },
];

const BRAND_NAV: NavItem[] = [
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/settings', label: 'Settings' },
];

export function navFor(me: MeResponse): NavItem[] {
  return me.user.role === 'BRAND' ? BRAND_NAV : CREATOR_NAV;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function roleLine(me: MeResponse): string {
  const role = me.user.role === 'BRAND' ? 'Brand' : 'Creator';
  const city = me.profileDetails?.city;
  return city ? `${role}, ${city}` : role;
}

function UserMenu({ me }: { me: MeResponse }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const { signOut, pending } = useSignOut();

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const picture = me.profile?.profilePictureUrl ?? null;
  return (
    <div className="relative" ref={ref}>
      <button
        ref={button}
        type="button"
        className={cx('usermenu-btn', open && 'is-open')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar name={me.user.username} src={picture} size={32} />
        <span className="chip-name">@{me.user.username}</span>
        <Icon name="caretDown" size={16} />
      </button>
      {open ? (
        <div className="menu" role="menu" aria-label="Account">
          <div className="menu-head">
            <p className="chip-name">@{me.user.username}</p>
            <p className="chip-sub">{roleLine(me)}</p>
          </div>
          <Link
            href="/contact"
            className="menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Contact us
          </Link>
          <button
            type="button"
            className="menu-item w-full text-left"
            role="menuitem"
            disabled={pending}
            onClick={signOut}
          >
            <Icon name="signOut" size={16} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MobileMenu({ me, nav, pathname }: { me: MeResponse; nav: NavItem[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const { signOut, pending } = useSignOut();

  // Close on navigation.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="app-sheet"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? 'x' : 'list'} />
      </button>
      {open ? (
        <nav id="app-sheet" className="sheet is-fixed" aria-label="Main">
          {me.user.role === 'BRAND' ? (
            <Link href="/campaigns/new" className="btn btn-primary btn-block mb-2">
              <Icon name="plus" />
              Post a deal
            </Link>
          ) : null}
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cx('sheet-item', isActive(pathname, item.href) && 'is-active')}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
          <div className="sheet-foot">
            <div className="flex items-center gap-3 px-3 py-2">
              <Avatar name={me.user.username} src={me.profile?.profilePictureUrl} size={32} />
              <div>
                <p className="chip-name">@{me.user.username}</p>
                <p className="chip-sub">{roleLine(me)}</p>
              </div>
            </div>
            <Link href="/contact" className="sheet-item">
              Contact us
            </Link>
            <button
              type="button"
              className="sheet-item w-full border-0 bg-transparent text-left"
              disabled={pending}
              onClick={signOut}
            >
              Sign out
            </button>
          </div>
        </nav>
      ) : null}
    </>
  );
}

/** The signed-in shell: role navigation, the user menu, and the full-sheet menu on phones. */
export function AppShell({ me, children }: { me: MeResponse; children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const nav = navFor(me);
  const home = nav[0]!.href;
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>
      <header className="topbar hidden md:block">
        <div className="topbar-in">
          <Link href={home} className="wordmark">
            ValueSkins
          </Link>
          <nav className="nav" aria-label="Main">
            {nav.map((item) => (
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
            {me.user.role === 'BRAND' ? (
              <Link href="/campaigns/new" className="btn btn-primary">
                <Icon name="plus" />
                Post a deal
              </Link>
            ) : null}
            <UserMenu me={me} />
          </div>
        </div>
      </header>
      <header className="topbar-m md:hidden">
        <Link href={home} className="wordmark">
          ValueSkins
        </Link>
        <MobileMenu me={me} nav={nav} pathname={pathname} />
      </header>
      <main id="main">{children}</main>
    </>
  );
}
