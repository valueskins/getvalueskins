'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { SignIn } from './SignIn';
import { Wordmark } from '@/components/shell/Wordmark';

const LINKS = [
  { href: '#brands', label: 'For brands' },
  { href: '#creators', label: 'For creators' },
  { href: '#how', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
];

/** The top bar: the wordmark, four links (a menu on phones) and sign-in. */
export function Nav() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="v3-nav">
      <a href="#main" className="v3-skip">
        Skip to content
      </a>
      <div className="v3-nav-in">
        <Link href="/" className="v3-nav-mark" aria-label="ValueSkins, home">
          <Wordmark />
        </Link>
        <nav
          aria-label="Site"
          className={open ? 'v3-nav-links is-open' : 'v3-nav-links'}
          id="site-links"
        >
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="v3-nav-end">
          <SignIn compact />
          <button
            ref={button}
            type="button"
            className="v3-menu-btn"
            aria-expanded={open}
            aria-controls="site-links"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>
    </header>
  );
}
