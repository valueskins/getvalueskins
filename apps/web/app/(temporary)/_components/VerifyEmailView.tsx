'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage, apiFetch } from '../../../lib/temporary/api';
import { errorClass, headingClass, hintClass, primaryButton } from './styles';

type State =
  | { kind: 'verifying' }
  | { kind: 'done' }
  | { kind: 'signed-out' }
  | { kind: 'failed'; message: string };

export function VerifyEmailView() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<State>(
    token ? { kind: 'verifying' } : { kind: 'failed', message: 'This link has no token.' },
  );
  // Strict mode runs effects twice in development; the token works only once.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    apiFetch('/api/me/email/verify', { method: 'POST', body: JSON.stringify({ token }) })
      .then(async (response) => {
        if (response.ok) return setState({ kind: 'done' });
        if (response.status === 401) return setState({ kind: 'signed-out' });
        setState({
          kind: 'failed',
          message: await apiErrorMessage(response, 'This link is invalid or has expired.'),
        });
      })
      .catch(() => setState({ kind: 'failed', message: 'Could not reach the server. Try again.' }));
  }, [token]);

  return (
    <div className="space-y-6">
      <h1 className={headingClass}>Verify your email</h1>
      {state.kind === 'verifying' ? <p className={hintClass}>Verifying</p> : null}
      {state.kind === 'done' ? (
        <>
          <p>Your email address is verified.</p>
          <Link href="/onboarding" className={primaryButton}>
            Continue
          </Link>
        </>
      ) : null}
      {state.kind === 'signed-out' ? (
        <>
          <p>Sign in first, then open the link in your email again.</p>
          <Link href="/" className={primaryButton}>
            Go to sign in
          </Link>
        </>
      ) : null}
      {state.kind === 'failed' ? (
        <>
          <p className={errorClass}>{state.message}</p>
          <Link href="/onboarding" className={primaryButton}>
            Back to setup
          </Link>
        </>
      ) : null}
    </div>
  );
}
