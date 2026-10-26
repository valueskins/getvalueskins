'use client';

import Link from 'next/link';
import { useConfig } from '@/lib/api/queries';
import { Wordmark } from './Wordmark';

const LINKS = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/refunds', label: 'Refunds' },
  { href: '/contact', label: 'Contact' },
];

/** The address shown until /api/config answers; it is the support address on staging and production. */
const SUPPORT_FALLBACK = 'founder@valueskins.com';

export function Footer() {
  const email = useConfig().data?.supportEmail ?? SUPPORT_FALLBACK;
  return (
    <footer className="v3-footer">
      <div className="v3-footer-in">
        <div className="v3-footer-brand">
          <Wordmark className="v3-wordmark-lg" />
          <a href={`mailto:${email}`} className="v3-footer-mail">
            {email}
          </a>
        </div>
        <nav aria-label="Footer" className="v3-footer-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="v3-footer-legal">© {new Date().getFullYear()} Valueskins Private Limited</p>
    </footer>
  );
}
