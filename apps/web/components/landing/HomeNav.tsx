'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Wordmark } from '@/components/shell/Wordmark';
import { HomeSignIn } from './HomeSignIn';

const LINKS = [
  { href: '#brands', label: 'For brands' },
  { href: '#creators', label: 'For creators' },
  { href: '#how', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
];

/**
 * The home page's top bar: a floating pill with the wordmark, the four section links (a menu on
 * narrow screens) and sign-in. It lifts onto glass once the page has scrolled, which a sentinel
 * at the top of the page reports, so nothing listens to scroll.
 */
export function HomeNav() {
  const [open, setOpen] = useState(false);
  const [raised, setRaised] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setRaised(!entry?.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
    <>
      <div ref={sentinel} className="hm-sentinel" aria-hidden="true" />
      <header className="hm-nav" data-raised={raised || open || undefined}>
        <a href="#main" className="hm-skip">
          Skip to content
        </a>
        <div className="hm-nav-in">
          <Link href="/" className="hm-nav-mark" aria-label="ValueSkins, home">
            <Wordmark />
          </Link>
          <nav aria-label="Site" id="hm-links" className={open ? 'hm-links is-open' : 'hm-links'}>
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="hm-nav-end">
            <HomeSignIn variant="nav" />
            <button
              ref={button}
              type="button"
              className="hm-menu-btn"
              aria-expanded={open}
              aria-controls="hm-links"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? 'Close' : 'Menu'}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
