'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { meEmailSchema, type MeResponse } from '@valueskins/shared';
import { queryKeys, useResendEmail, useStartEmail } from '@/lib/api/queries';
import { errorText, isApiError } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { describedBy, Field, Input } from '@/components/ui/Field';

export const EMAIL_LIMIT_REASON = 'Too many emails. Try again in an hour.';
const INVALID_EMAIL = 'Enter an email address like name@example.com.';

/** A new link can be asked for 60 seconds after the last one, so a slow inbox is not flooded. */
export const RESEND_WAIT_MS = 60_000;
const SENT_KEY = 'vs-email-link-sent:';

/** Notes when a link went to `email`, in this tab, so the wait survives a reload. */
export function noteLinkSent(email: string, at: number = Date.now()): void {
  try {
    sessionStorage.setItem(SENT_KEY + email.toLowerCase(), String(at));
  } catch {
    // Storage can be blocked; the wait then only lasts while the page is open.
  }
}

function linkSentAt(email: string): number | null {
  try {
    const value = Number(sessionStorage.getItem(SENT_KEY + email.toLowerCase()));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Whole seconds left before "Send the link again" can be used, counting down once a second. */
export function useResendWait(email: string, sentAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  const from = sentAt ?? linkSentAt(email);
  const left = from === null ? 0 : Math.max(0, Math.ceil((from + RESEND_WAIT_MS - now) / 1000));
  useEffect(() => {
    if (left <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(timer);
  }, [left, now]);
  return left;
}

export function resendWaitReason(seconds: number): string {
  return `You can send it again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
}

interface EmailFlowState {
  sentTo: string | null;
  setSentTo: (email: string | null) => void;
}

/**
 * The address a link was sent to: `pendingEmail` from GET /me (SPEC 6.4), so it survives a
 * reload and shows in every tab. A local value covers the moment right after sending (until /me
 * is read again) and "Use a different address", which hides the pending one to show the form.
 */
export function useEmailFlow(me: MeResponse): EmailFlowState {
  const client = useQueryClient();
  const [local, setLocal] = useState<string | null | undefined>(undefined);
  return {
    sentTo: local !== undefined ? local : me.user.pendingEmail,
    setSentTo: (email) => {
      setLocal(email);
      // A new link was sent: read /me again so pendingEmail follows it in other tabs too.
      if (email !== null) void client.invalidateQueries({ queryKey: queryKeys.me });
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
      onSuccess: () => {
        noteLinkSent(parsed.data.email);
        onSent(parsed.data.email.toLowerCase());
      },
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

/**
 * After sending: the address, "Send the link again" (after a 60-second wait with a visible countdown,
 * or the hourly limit), and "Change email" to start again with a different address.
 */
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
  const [resentAt, setResentAt] = useState<number | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const wait = useResendWait(sentTo, resentAt);

  function again() {
    setNote(null);
    resend.mutate(undefined, {
      onSuccess: () => {
        const at = Date.now();
        noteLinkSent(sentTo, at);
        setResentAt(at);
        setNote({ tone: 'ok', text: `We sent a new link to ${sentTo}.` });
      },
      onError: (err) => {
        if (isApiError(err, 'RATE_LIMITED')) setLimited(true);
        else if (isApiError(err, 'NO_PENDING_EMAIL')) onDifferent();
        else setNote({ tone: 'error', text: errorText(err) });
      },
    });
  }

  const reason = limited ? EMAIL_LIMIT_REASON : wait > 0 ? resendWaitReason(wait) : null;

  return (
    <div className="flex flex-col gap-4">
      {compact ? null : (
        <>
          <p className="t-body" role="status">
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
          disabledReason={reason}
          onClick={again}
        >
          Send the link again
        </Button>
        <Button variant="text" size={compact ? 'sm' : 'md'} onClick={onDifferent}>
          Change email
        </Button>
      </div>
    </div>
  );
}
