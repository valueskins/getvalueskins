'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Callout } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/cx';
import { instagramLinkUrl, instagramSignInUrl } from '@/lib/signIn';
import { apiHasAnswered, waitForApi } from '@/lib/wake';
import { CONNECTING_REASON } from './signInCopy';

export type Phase = 'ready' | 'connecting' | 'failed';

/**
 * A link: sign-in leaves the app for the API and Instagram, then comes back. The API may be asleep
 * (the free Render instance, docs/DEPLOYMENT.md section 21.8), and a link to a sleeping API is a blank
 * wait. So when the API has not answered yet, a click shows "Connecting..." until it does, then goes on;
 * after 60 seconds without an answer it says so and offers "Try again".
 */
export function InstagramButton({
  label = 'Sign in with Instagram',
  link = false,
  large = false,
  block = false,
  variant = 'primary',
  className: extraClassName,
  onPhase,
  showReason = true,
}: {
  label?: string;
  link?: boolean;
  large?: boolean;
  block?: boolean;
  variant?: 'primary' | 'secondary';
  /** Replaces the shared button classes, for a page with its own button style. */
  className?: string;
  /** Told each time the button moves between ready, connecting and failed. */
  onPhase?: (phase: Phase) => void;
  /** Says why it is waiting ("Waking up ValueSkins..."). Off where the page shows it itself. */
  showReason?: boolean;
}) {
  const href = link ? instagramLinkUrl() : instagramSignInUrl();
  const [phase, setPhase] = useState<Phase>('ready');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onPhase?.(phase);
  }, [phase, onPhase]);

  const className =
    extraClassName ??
    cx('btn', `btn-${variant}`, block && 'btn-block', large && 'h-[52px] px-6 text-base');

  async function connect() {
    setPhase('connecting');
    const answered = await waitForApi();
    if (!mounted.current) return;
    if (answered) {
      window.location.assign(href);
      return;
    }
    setPhase('failed');
  }

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    // Awake: an ordinary link, as before.
    if (apiHasAnswered()) return;
    event.preventDefault();
    void connect();
  }

  if (phase === 'connecting') {
    const button = (
      <button type="button" className={className} disabled aria-busy="true">
        <span className="spinner" aria-hidden="true" />
        Connecting...
      </button>
    );
    if (!showReason) return button;
    return (
      <span className="signin-wait">
        {button}
        <span className="reason" role="status">
          <Icon name="clock" size={16} />
          {CONNECTING_REASON}
        </span>
      </span>
    );
  }

  if (phase === 'failed') {
    return (
      <div className="flex flex-col items-stretch gap-3 sm:items-start">
        <Callout tone="error" role="alert">
          We could not reach ValueSkins. Try again.
        </Callout>
        <button type="button" className={className} onClick={() => void connect()}>
          <Icon name="instagram" />
          Try again
        </button>
      </div>
    );
  }

  return (
    <a href={href} className={className} onClick={onClick}>
      <Icon name="instagram" />
      {label}
    </a>
  );
}
