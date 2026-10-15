'use client';

import { useState, type FormEvent } from 'react';
import { meEmailSchema } from '@valueskins/shared';
import { useResendEmail, useStartEmail } from '@/lib/api/queries';
import { errorText, isApiError } from '@/lib/api/errors';
import { pendingEmail } from '@/lib/sessionMemory';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { describedBy, Field, Input } from '@/components/ui/Field';

export const EMAIL_LIMIT_REASON = 'Too many emails. Try again in an hour.';
const INVALID_EMAIL = 'Enter an email address like name@example.com.';

interface EmailFlowState {
  sentTo: string | null;
  setSentTo: (email: string | null) => void;
}

/** Remembers the address a link was sent to for this tab (see sessionMemory). */
export function useEmailFlow(userId: string): EmailFlowState {
  const [sentTo, setSentToState] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : pendingEmail.get(userId),
  );
  return {
    sentTo,
    setSentTo: (email) => {
      pendingEmail.set(userId, email);
      setSentToState(email);
    },
  };
}

/** Enter an address, get a link. Used by onboarding and by the settings email panel. */
export function EmailForm({
  onSent,
  initial = '',
  label = 'Email',
  help = 'We send a link to confirm it. The link works for 24 hours.',
  secondary,
}: {
  onSent: (email: string) => void;
  initial?: string;
  label?: string;
  help?: string;
  secondary?: React.ReactNode;
}) {
  const start = useStartEmail();
  const [email, setEmail] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = meEmailSchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setError(INVALID_EMAIL);
      return;
    }
    setError(null);
    start.mutate(parsed.data.email, {
      onSuccess: () => onSent(parsed.data.email.toLowerCase()),
      onError: (err) =>
        setError(
          errorText(err, { RATE_LIMITED: EMAIL_LIMIT_REASON, VALIDATION_ERROR: INVALID_EMAIL }),
        ),
    });
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <Field id="email-address" label={label} help={help} error={error}>
        <Input
          id="email-address"
          type="email"
          autoComplete="email"
          value={email}
          invalid={Boolean(error)}
          aria-describedby={describedBy('email-address', true, error)}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={start.isPending}>
          Send link
        </Button>
        {secondary}
      </div>
    </form>
  );
}

/** After sending: resend, or start again with a different address. */
export function EmailSent({
  sentTo,
  onDifferent,
  compact = false,
}: {
  sentTo: string;
  onDifferent: () => void;
  compact?: boolean;
}) {
  const resend = useResendEmail();
  const [limited, setLimited] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  function again() {
    setNote(null);
    resend.mutate(undefined, {
      onSuccess: () => setNote({ tone: 'ok', text: `We sent a new link to ${sentTo}.` }),
      onError: (err) => {
        if (isApiError(err, 'RATE_LIMITED')) setLimited(true);
        else if (isApiError(err, 'NO_PENDING_EMAIL')) onDifferent();
        else setNote({ tone: 'error', text: errorText(err) });
      },
    });
  }

  return (
    <div className="flex flex-col gap-4" role="status">
      {compact ? null : (
        <>
          <p className="t-body">
            We sent a link to <strong className="font-semibold">{sentTo}</strong>.
          </p>
          <p className="t-body c-ink-2">
            Open it on any device to confirm your email. The link works for 24 hours and can be used
            once. Then come back here to continue.
          </p>
          <Callout tone="info">
            <p>
              Not there? Look in spam or promotions. The email comes from
              notifications@valueskins.com.
            </p>
          </Callout>
        </>
      )}
      {note ? (
        <Callout tone={note.tone} role={note.tone === 'error' ? 'alert' : 'status'}>
          <p>{note.text}</p>
        </Callout>
      ) : null}
      <div className="flex flex-wrap items-start gap-3">
        <Button
          variant="secondary"
          size={compact ? 'sm' : 'md'}
          loading={resend.isPending}
          disabledReason={limited ? EMAIL_LIMIT_REASON : null}
          onClick={again}
        >
          Send the link again
        </Button>
        <Button variant="text" size={compact ? 'sm' : 'md'} onClick={onDifferent}>
          Use a different email
        </Button>
      </div>
    </div>
  );
}
