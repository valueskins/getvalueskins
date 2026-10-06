'use client';

import { meEmailSchema } from '@valueskins/shared';
import { useState } from 'react';
import { apiErrorMessage, apiFetch } from '../../../../lib/temporary/api';
import { errorClass, hintClass, inputClass, primaryButton, secondaryButton } from '../styles';
import { useAction } from '../useAction';

export function EmailForm() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const valid = meEmailSchema.safeParse({ email: email.trim() }).success;

  async function send(path: '/api/me/email' | '/api/me/email/resend', body?: object) {
    return run(async () => {
      const response = await apiFetch(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.status === 429) return 'Too many emails. Try again in an hour.';
      return response.ok ? null : apiErrorMessage(response, 'Could not send the email.');
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (await send('/api/me/email', { email: address })) setSentTo(address);
  }

  if (sentTo) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Check your email</h2>
        <p>
          We sent a link to {sentTo}. Open it in this browser to verify your address. The link works
          for 24 hours.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => send('/api/me/email/resend')}
          className={secondaryButton}
        >
          Send the link again
        </button>
        {error ? <p className={errorClass}>{error}</p> : null}
        <p className={hintClass}>After you open the link, come back to this page.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-semibold">Verify your email</h2>
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
        Send verification link
      </button>
      {!valid ? <p className={hintClass}>Enter a valid email address to continue.</p> : null}
      {error ? <p className={errorClass}>{error}</p> : null}
    </form>
  );
}
