'use client';

import { emailLoginVerifySchema } from '@valueskins/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '../../../lib/temporary/api';
import { errorClass, hintClass, inputClass, primaryButton } from './styles';

export function EmailCodeForm() {
  const router = useRouter();
  const email = useSearchParams().get('email') ?? '';
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!email) {
    return (
      <p className={hintClass}>
        No email address was provided.{' '}
        <Link href="/auth/email" className="underline">
          Start again
        </Link>
      </p>
    );
  }

  const valid = emailLoginVerifySchema.safeParse({ email, code }).success;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch('/api/auth/email/verify', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      });
      if (response.status === 429) {
        setError('Too many attempts. Wait a while and try again.');
        return;
      }
      if (!response.ok) {
        setError('That code is incorrect or has expired.');
        return;
      }
      router.push('/me');
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className={hintClass}>We sent a 6-digit code to {email}.</p>
      <label className="block space-y-2">
        <span>Code</span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={!valid || busy} className={primaryButton}>
        Sign in
      </button>
      {!valid ? (
        <p className={hintClass}>Enter the 6-digit code from your email to sign in.</p>
      ) : null}
      {error ? <p className={errorClass}>{error}</p> : null}
      <p className={hintClass}>
        <Link href="/auth/email" className="underline">
          Use a different email or get a new code
        </Link>
      </p>
    </form>
  );
}
