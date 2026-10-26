'use client';

import { useState } from 'react';
import { InstagramButton, type Phase } from '@/components/public/InstagramButton';

export const CONNECTING_REASON = 'Waking up ValueSkins. This can take up to a minute.';
export const ACCOUNT_NOTE =
  'Your Instagram account must be public and a Business or Creator account.';

/**
 * The home page's sign-in: the same InstagramButton as everywhere else, drawn in the page's style.
 * While it waits for a sleeping API it says why; after 60 seconds the button offers "Try again".
 * `compact` is the navigation's version: a short label, and the note left to the page.
 */
export function SignIn({
  compact = false,
  onDark = false,
}: {
  compact?: boolean;
  onDark?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('ready');
  return (
    <div className={compact ? 'v3-signin v3-signin-compact' : 'v3-signin'}>
      <InstagramButton
        label={compact ? 'Sign in' : 'Sign in with Instagram'}
        className={
          compact
            ? 'v3-btn v3-btn-sm'
            : onDark
              ? 'v3-btn v3-btn-lg v3-btn-glow'
              : 'v3-btn v3-btn-lg'
        }
        onPhase={setPhase}
      />
      {phase === 'connecting' ? (
        <p className="v3-reason" role="status">
          {CONNECTING_REASON}
        </p>
      ) : null}
      {compact ? null : <p className="v3-note">{ACCOUNT_NOTE}</p>}
    </div>
  );
}
