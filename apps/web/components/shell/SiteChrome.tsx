'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Nav } from '@/components/landing/Nav';
import '@/app/landing.css';
import { useSupportAddress } from './SupportEmail';
import { Wordmark } from './Wordmark';

/**
 * The public pages' top bar: the home page's own navigation, with its Sign in button and wake
 * states, linking back to the home page's sections. It brings the home page's styles with it.
 */
export function SiteHeader() {
  return (
    <div className="v3 site-header-v3">
      <Nav onHome={false} />
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

/** The dark footer of the home page and every public page. */
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
