'use client';

import { meInstagramUsernameSchema } from '@valueskins/shared';
import { useState } from 'react';
import { apiErrorMessage, apiFetch, apiUrl } from '../../../../lib/temporary/api';
import { errorClass, hintClass, inputClass, primaryButton } from '../styles';
import { useAction } from '../useAction';

export function InstagramUsernameForm({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const { busy, error, run } = useAction();
  const valid = meInstagramUsernameSchema.safeParse({ username }).success;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await run(async () => {
      const response = await apiFetch('/api/me/instagram-username', {
        method: 'POST',
        body: JSON.stringify({ username }),
      });
      return response.ok ? null : apiErrorMessage(response, 'Could not save your username.');
    });
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-semibold">Your Instagram username</h2>
      <p className={hintClass}>
        Type the username of your Instagram account. It is not checked until you connect Instagram.
      </p>
      <label className="block space-y-2">
        <span>Instagram username</span>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoCapitalize="none"
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={!valid || busy} className={primaryButton}>
        Save username
      </button>
      {!valid ? (
        <p className={hintClass}>
          Enter 1 to 30 letters, numbers, dots or underscores to continue.
        </p>
      ) : null}
      {error ? <p className={errorClass}>{error}</p> : null}
      <p className={hintClass}>
        Or{' '}
        <a href={apiUrl('/api/auth/instagram/start?link=1')} className="underline">
          connect Instagram now
        </a>
        .
      </p>
    </form>
  );
}
