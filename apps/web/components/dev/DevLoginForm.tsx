'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { devLoginSchema, USER_ROLES, type MeResponse, type UserRole } from '@valueskins/shared';
import { homePathFor } from '@/lib/access';
import { api } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/queries';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';

const ROLE_LABELS: Record<UserRole, string> = { CREATOR: 'Creator', BRAND: 'Brand' };

export function DevLoginForm() {
  const router = useRouter();
  const client = useQueryClient();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>('CREATOR');
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = devLoginSchema.safeParse({ username: username.trim(), role }).success;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/dev/login', {
        username: username.trim(),
        role,
        ...(admin ? { admin: true } : {}),
      });
      const me = await api<MeResponse>('GET', '/me');
      client.setQueryData(queryKeys.me, me);
      // The launch flags in the config depend on who is signed in (SPEC 19).
      void client.invalidateQueries({ queryKey: queryKeys.config });
      router.replace(homePathFor(me));
    } catch (err) {
      setError(
        isApiError(err, 'NOT_FOUND')
          ? 'Dev login is off on the API. Set ENABLE_DEV_LOGIN=true there.'
          : errorText(err),
      );
      setBusy(false);
    }
  }

  return (
    <form className="card flex flex-col gap-5 p-5 md:p-6" onSubmit={submit} noValidate>
      <Field id="dev-username" label="Username">
        <Input
          id="dev-username"
          value={username}
          autoComplete="off"
          onChange={(e) => setUsername(e.target.value)}
        />
      </Field>
      <Field
        id="dev-role"
        label="Role"
        help="Used only when the user is created. An existing user keeps its role."
      >
        <Select
          id="dev-role"
          value={role}
          aria-describedby="dev-role-help"
          onChange={(e) => setRole(e.target.value as UserRole)}
        >
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col gap-1">
        <Checkbox
          label="Admin"
          checked={admin}
          aria-describedby="dev-admin-help"
          onChange={(e) => setAdmin(e.target.checked)}
        />
        <p id="dev-admin-help" className="field-help">
          Makes a new user an admin. Like the role, it is used only when the user is created.
        </p>
      </div>
      {error ? (
        <Callout tone="error" role="alert">
          <p>{error}</p>
        </Callout>
      ) : null}
      <div>
        <Button
          type="submit"
          loading={busy}
          disabledReason={valid ? null : 'Enter a username to sign in'}
        >
          Sign in
        </Button>
      </div>
    </form>
  );
}
