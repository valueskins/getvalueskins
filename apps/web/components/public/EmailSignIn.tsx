'use client';

import { useQueryClient } from '@tanstack/react-query';
import { notFound, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { emailLoginStartSchema, emailLoginVerifySchema, type MeResponse } from '@valueskins/shared';
import { homePathFor } from '@/lib/access';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { queryKeys, useConfig } from '@/lib/api/queries';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { describedBy, Field, Input } from '@/components/ui/Field';
import { LoadError } from '@/components/ui/LoadError';
import { PageSkeleton } from '@/components/ui/Skeleton';

/**
 * Email-code sign-in, for staging and tests only (SPEC 6.5). It exists only while
 * GET /config says so. An account made this way connects Instagram during setup.
 */
export function EmailSignIn() {
  const config = useConfig();
  const router = useRouter();
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (config.isError) {
    return (
      <LoadError
        className="page"
        title="We could not load the sign-in page"
        error={config.error}
        onRetry={() => void config.refetch()}
      />
    );
  }
  if (config.isPending) return <PageSkeleton />;
  if (config.isSuccess && !config.data.authEmailEnabled) notFound();

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    const parsed = emailLoginStartSchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setError('Enter an email address like name@example.com.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/auth/email/start', parsed.data);
      setSentTo(parsed.data.email);
    } catch (err) {
      setError(errorText(err, { RATE_LIMITED: 'Too many tries. Wait a while, then try again.' }));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    const parsed = emailLoginVerifySchema.safeParse({ email: sentTo, code: code.trim() });
    if (!parsed.success) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/auth/email/verify', parsed.data);
      const me = await api<MeResponse>('GET', '/me');
      client.setQueryData(queryKeys.me, me);
      // The launch flags in the config depend on who is signed in (SPEC 19).
      void client.invalidateQueries({ queryKey: queryKeys.config });
      router.replace(homePathFor(me));
    } catch (err) {
      setError(errorText(err, { RATE_LIMITED: 'Too many tries. Wait a while, then try again.' }));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-[520px] flex-col gap-6 px-4 pb-[88px] pt-10 md:pt-16">
      <div className="flex flex-col gap-2">
        <span className="badge badge-wait self-start">Staging only</span>
        <h1 className="t-h1">Sign in with email</h1>
        <p className="t-body c-ink-2">
          For testing. You still connect an Instagram account during setup.
        </p>
      </div>
      {sentTo === null ? (
        <form className="card flex flex-col gap-5 p-5 md:p-6" onSubmit={sendCode} noValidate>
          <Field id="signin-email" label="Email" error={error}>
            <Input
              id="signin-email"
              type="email"
              autoComplete="email"
              value={email}
              invalid={Boolean(error)}
              aria-describedby={describedBy('signin-email', null, error)}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <div>
            <Button type="submit" loading={busy}>
              Send code
            </Button>
          </div>
        </form>
      ) : (
        <form className="card flex flex-col gap-5 p-5 md:p-6" onSubmit={verify} noValidate>
          <Callout tone="info" role="status">
            <p>
              We sent a 6-digit code to <strong>{sentTo}</strong>. It works for 10 minutes.
            </p>
          </Callout>
          <Field id="signin-code" label="Code" error={error}>
            <Input
              id="signin-code"
              mono
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              invalid={Boolean(error)}
              aria-describedby={describedBy('signin-code', null, error)}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={busy}>
              Sign in
            </Button>
            <Button
              variant="text"
              onClick={() => {
                setSentTo(null);
                setCode('');
                setError(null);
              }}
            >
              Use a different email
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
