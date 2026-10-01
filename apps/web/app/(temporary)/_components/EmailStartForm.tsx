'use client';

import { emailLoginStartSchema } from '@valueskins/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '../../../lib/temporary/api';
import { errorClass, hintClass, inputClass, primaryButton } from './styles';

export function EmailStartForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = emailLoginStartSchema.safeParse({ email: email.trim() }).success;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch('/api/auth/email/start', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      if (response.status === 429) {
        setError('Too many attempts. Wait a while and try again.');
        return;
      }
      if (!response.ok) {
        setError('Could not send the code. Try again.');
        return;
      }
      router.push(`/auth/email/code?email=${encodeURIComponent(email.trim())}`);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-2">
        <span>Email address</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={!valid || busy} className={primaryButton}>
        Send code
      </button>
      {!valid ? <p className={hintClass}>Enter a valid email address to send a code.</p> : null}
      {error ? <p className={errorClass}>{error}</p> : null}
    </form>
  );
}
