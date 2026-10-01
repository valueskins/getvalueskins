'use client';

import { USER_ROLES, type UserRole, devLoginSchema } from '@valueskins/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '../../../lib/temporary/api';
import { errorClass, hintClass, inputClass, primaryButton } from './styles';

export function DevLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>('CREATOR');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = devLoginSchema.safeParse({ username: username.trim(), role }).success;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch('/api/dev/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), role }),
      });
      if (!response.ok) {
        setError('Dev login failed. Check that ENABLE_DEV_LOGIN is true on the API.');
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
      <label className="block space-y-2">
        <span>Username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block space-y-2">
        <span>Role (used only when the user is created)</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className={inputClass}
        >
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={!valid || busy} className={primaryButton}>
        Dev login
      </button>
      {!valid ? <p className={hintClass}>Enter a username to log in.</p> : null}
      {error ? <p className={errorClass}>{error}</p> : null}
    </form>
  );
}
