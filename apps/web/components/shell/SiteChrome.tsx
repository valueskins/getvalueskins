'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SupportEmail } from './SupportEmail';

export function SiteHeader() {
  const active = usePathname() === '/how-it-works' ? 'how-it-works' : undefined;
  return (
    <header className="site-header">
      <div className="site-header-in">
        <Link href="/" className="wordmark">
          ValueSkins
        </Link>
        <nav aria-label="Site">
          <Link
            href="/how-it-works"
            className={active === 'how-it-works' ? 'site-link is-active' : 'site-link'}
            aria-current={active === 'how-it-works' ? 'page' : undefined}
          >
            How it works
          </Link>
        </nav>
      </div>
    </header>
  );
}

const FOOTER_LINKS = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/refunds', label: 'Refunds' },
  { href: '/contact', label: 'Contact' },
];

export function SiteFooter() {
  const pathname = usePathname();
  return (
    <footer className="site-footer">
      <div className="site-footer-in">
        <div className="flex flex-col gap-1">
          <p className="wordmark" style={{ fontSize: 17 }}>
            ValueSkins
          </p>
          <p className="footer-meta">© {new Date().getFullYear()} Valueskins Private Limited</p>
        </div>
        <nav className="footer-links" aria-label="Footer">
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
        <SupportEmail className="t-small inline-flex min-h-[44px] items-center" />
      </div>
    </footer>
  );
}
