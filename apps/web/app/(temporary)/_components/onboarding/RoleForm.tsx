'use client';

import { ROLE_CANNOT_CHANGE_WARNING, type UserRole } from '@valueskins/shared';
import { useState } from 'react';
import { apiErrorMessage, apiFetch } from '../../../../lib/temporary/api';
import { errorClass, hintClass, primaryButton } from '../styles';
import { useAction } from '../useAction';

export function RoleForm({ onDone }: { onDone: () => void }) {
  const [role, setRole] = useState<UserRole | null>(null);
  const { busy, error, run } = useAction();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!role) return;
    const ok = await run(async () => {
      const response = await apiFetch('/api/me/role', {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      return response.ok ? null : apiErrorMessage(response, 'Could not save your account type.');
    });
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-semibold">Choose your account type</h2>
      <fieldset className="space-y-2">
        <legend className="sr-only">Account type</legend>
        {(['CREATOR', 'BRAND'] as const).map((value) => (
          <label key={value} className="flex items-center gap-3">
            <input
              type="radio"
              name="role"
              value={value}
              checked={role === value}
              onChange={() => setRole(value)}
            />
            <span>{value === 'CREATOR' ? 'Creator' : 'Brand'}</span>
          </label>
        ))}
      </fieldset>
      <p className="text-danger">{ROLE_CANNOT_CHANGE_WARNING}</p>
      <button type="submit" disabled={!role || busy} className={primaryButton}>
        Save account type
      </button>
      {!role ? <p className={hintClass}>Choose Creator or Brand to continue.</p> : null}
      {error ? <p className={errorClass}>{error}</p> : null}
    </form>
  );
}
