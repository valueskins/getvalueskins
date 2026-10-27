'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConfig } from '@/lib/api/queries';
import { SkipLink } from './SkipLink';
import { Wordmark } from './Wordmark';

/** The public pages' top bar: the home page's glass bar, with the wordmark and How it works. */
export function SiteHeader() {
  const active = usePathname() === '/how-it-works' ? 'how-it-works' : undefined;
  return (
    <>
      <SkipLink />
      <header className="site-header">
        <div className="site-header-in">
          <Link href="/" className="wordmark-link" aria-label="ValueSkins, home">
            <Wordmark />
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
    </>
  );
}

const FOOTER_LINKS = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/refunds', label: 'Refunds' },
  { href: '/contact', label: 'Contact' },
];

/** The address shown until /api/config answers; it is the support address on staging and production. */
const SUPPORT_FALLBACK = 'founder@valueskins.com';

/** The dark footer of the home page and every public page. */
export function SiteFooter() {
  const pathname = usePathname();
  const email = useConfig().data?.supportEmail ?? SUPPORT_FALLBACK;
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
