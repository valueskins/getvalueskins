'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Callout } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/cx';
import { instagramLinkUrl, instagramSignInUrl } from '@/lib/signIn';
import { apiHasAnswered, waitForApi } from '@/lib/wake';

type Phase = 'ready' | 'connecting' | 'failed';

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
}: {
  label?: string;
  link?: boolean;
  large?: boolean;
  block?: boolean;
  variant?: 'primary' | 'secondary';
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

  const className = cx(
    'btn',
    `btn-${variant}`,
    block && 'btn-block',
    large && 'h-[52px] px-6 text-base',
  );

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
    return (
      <button type="button" className={className} disabled aria-busy="true">
        <Icon name="instagram" />
        Connecting...
      </button>
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
