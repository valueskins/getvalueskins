'use client';

import type { MeResponse } from '@valueskins/shared';
import { Button } from '@/components/ui/Button';
import { SIGNING_OUT_REASON, useSignOut } from './useSignOut';
import { Wordmark } from './Wordmark';

/** The plain top bar while setting up: no navigation yet. */
export function SetupTopbar({ me }: { me: MeResponse }) {
  const { signOut, pending } = useSignOut();
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Wordmark />
        <div className="topbar-right">
          {pending ? (
            <span className="t-small c-ink-2" role="status">
              {SIGNING_OUT_REASON}
            </span>
          ) : (
            <span className="t-small c-ink-2 hidden sm:inline">
              Signed in as @{me.user.username}
            </span>
          )}
          <Button variant="text" size="sm" onClick={signOut} disabled={pending}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
