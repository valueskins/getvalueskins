'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { HomeNav } from '@/components/landing/HomeNav';
import '@/app/home.css';
import { useSupportAddress } from './SupportEmail';
import { Wordmark } from './Wordmark';

/** The same places from any other page: the home page's sections, and the How it works page. */
const PAGE_LINKS = [
  { href: '/#brands', label: 'For brands' },
  { href: '/#creators', label: 'For creators' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/#faq', label: 'FAQ' },
];

/**
 * The public pages' top bar: the home page's own floating navigation bar, with its Sign in button
 * and wake states, linking back to the home page's sections. It must sit inside the `.hm` frame
 * (PublicFrame), which carries the home page's tokens and styles.
 */
export function SiteHeader() {
  return <HomeNav links={PAGE_LINKS} />;
}

/**
 * The frame of every public page: the home page's look (`.hm`), the navigation bar, the page and
 * the footer. A page that keeps its own `<main>` passes it as children.
 */
export function PublicFrame({
  children,
  footer = true,
}: {
  children: ReactNode;
  footer?: boolean;
}) {
  return (
    <div className="hm flex min-h-screen flex-col">
      <SiteHeader />
      {children}
      {footer ? <SiteFooter /> : null}
    </div>
  );
}

const FOOTER_LINKS = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/refunds', label: 'Refunds' },
  { href: '/contact', label: 'Contact' },
];

/** The footer of the home page and every public page: a light band on the second ground. */
export function SiteFooter() {
  const pathname = usePathname();
  const email = useSupportAddress();
  return (
    <footer className="site-footer">
      <div className="site-footer-in">
        <div className="site-footer-brand">
          <Wordmark className="wordmark-lg" />
          <a href={`mailto:${email}`} className="site-footer-mail">
            {email}
          </a>
        </div>
        <nav aria-label="Footer" className="footer-links">
          {FOOTER_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="site-footer-legal">© {new Date().getFullYear()} Valueskins Private Limited</p>
    </footer>
  );
}
