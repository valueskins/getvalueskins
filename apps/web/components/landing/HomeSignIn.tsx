'use client';

import { useRef, useState } from 'react';
import { InstagramButton, type Phase } from '@/components/public/InstagramButton';
import { ACCOUNT_NOTE, CONNECTING_REASON } from '@/components/public/signInCopy';
import { useMagnet } from './useMagnet';

const BUTTON = {
  nav: 'hm-btn hm-btn-sm',
  hero: 'hm-btn hm-btn-lg',
  ink: 'hm-btn hm-btn-lg hm-btn-ink',
} as const;

/**
 * The home page's sign-in: the shared InstagramButton in this page's style. While it waits for a
 * sleeping API it says why; after 60 seconds the button offers "Try again". `nav` is the top bar's
 * version: a short label, and the account note left to the page.
 */
export function HomeSignIn({ variant = 'hero' }: { variant?: keyof typeof BUTTON }) {
  const [phase, setPhase] = useState<Phase>('ready');
  const magnet = useRef<HTMLSpanElement>(null);
  useMagnet(magnet, variant === 'nav' ? 4 : 10);
  const compact = variant === 'nav';
  return (
    <div className={`hm-signin hm-signin-${variant}`}>
      <span className="hm-magnet" ref={magnet}>
        <InstagramButton
          label={compact ? 'Sign in' : 'Sign in with Instagram'}
          className={BUTTON[variant]}
          onPhase={setPhase}
          showReason={false}
        />
      </span>
      {phase === 'connecting' ? (
        <p className="hm-reason" role="status">
          {CONNECTING_REASON}
        </p>
      ) : null}
      {compact ? null : <p className="hm-note">{ACCOUNT_NOTE}</p>}
    </div>
  );
}
