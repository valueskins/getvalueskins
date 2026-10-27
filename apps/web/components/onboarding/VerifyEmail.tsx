'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isOnboarded } from '@/lib/access';
import { errorText, isApiError } from '@/lib/api/errors';
import { useMe, useVerifyEmail, type VerifyEmailResult } from '@/lib/api/queries';
import { Callout } from '@/components/ui/Callout';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cx } from '@/components/ui/cx';
import { SiteFooter, SiteHeader } from '@/components/shell/SiteChrome';
import { SetupTopbar } from '@/components/shell/SetupTopbar';
import { InstagramButton } from '@/components/public/InstagramButton';

type State =
  | { kind: 'confirming' }
  | { kind: 'done'; result: VerifyEmailResult }
  | { kind: 'failed'; message: string; taken: boolean };

export const SIGNED_OUT_CONFIRMED =
  'Email confirmed. Go back to the browser where you started, or sign in here with the same Instagram account.';

/** The page's one card: a tinted icon, a heading and what to do next. */
function StatusCard({
  icon,
  tone,
  title,
  children,
  live,
}: {
  icon: IconName;
  tone: 'ok' | 'error' | 'wait';
  title: string;
  children: ReactNode;
  live?: 'status' | 'alert';
}) {
  return (
    <section className="status-card" role={live} aria-labelledby="verify-title">
      <span className={cx('status-icon', `status-icon-${tone}`)} aria-hidden="true">
        <Icon name={icon} size={24} />
      </span>
      <h1 id="verify-title" className="t-h1">
        {title}
      </h1>
      {children}
    </section>
  );
}

/**
 * The link in the verification email (SPEC 6.4). The token alone proves the address, so the link
 * works in any browser, signed in or not, and never signs anyone in. When this browser is signed in
 * as the same person, they continue where they were; otherwise they are told to go back, or sign in.
 */
export function VerifyEmail() {
  const token = useSearchParams()?.get('token') ?? '';
  const me = useMe();
  const verify = useVerifyEmail();
  const [state, setState] = useState<State>({ kind: 'confirming' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (token.length < 20) {
      setState({ kind: 'failed', message: 'This link is invalid or has expired.', taken: false });
      return;
    }
    verify.mutate(token, {
      onSuccess: (result) => setState({ kind: 'done', result }),
      onError: (err) =>
        setState({
          kind: 'failed',
          message: errorText(err),
          taken: isApiError(err, 'EMAIL_TAKEN'),
        }),
    });
  }, [token, verify]);

  const signedIn = me.data ?? null;
  const settled = me.isSuccess || me.isError;
  const back =
    signedIn && isOnboarded(signedIn)
      ? { href: '/settings', label: 'Go to Settings' }
      : { href: '/onboarding', label: 'Back to setup' };

  let body: ReactNode;
  if (state.kind === 'confirming') {
    body = (
      <StatusCard icon="envelope" tone="wait" title="Confirming your email" live="status">
        <p className="t-body c-ink-2 flex items-center justify-center gap-2">
          <span className="spinner" aria-hidden="true" />
          This takes a moment.
        </p>
      </StatusCard>
    );
  } else if (state.kind === 'done' && state.result.onboarding) {
    const onboarding = state.result.onboarding;
    body = (
      <StatusCard icon="checkCircle" tone="ok" title="Email confirmed" live="status">
        <p className="t-body">
          <strong className="font-semibold">{state.result.email}</strong> is verified.
        </p>
        <p className="t-body c-ink-2">
          Deal updates, payment confirmations and documents will go to this address. You can change
          it later in Settings.
        </p>
        <Link href={onboarding.completed ? '/settings' : '/onboarding'} className="btn btn-primary">
          {onboarding.completed ? 'Go to Settings' : 'Continue'}
        </Link>
      </StatusCard>
    );
  } else if (state.kind === 'done') {
    body = (
      <StatusCard icon="checkCircle" tone="ok" title="Email confirmed" live="status">
        <p className="t-body">
          <strong className="font-semibold">{state.result.email}</strong> is verified.
        </p>
        <p className="t-body c-ink-2">{SIGNED_OUT_CONFIRMED}</p>
        <InstagramButton />
      </StatusCard>
    );
  } else {
    body = (
      <StatusCard
        icon="warningCircle"
        tone="error"
        title={state.taken ? 'That email is already used' : 'This link did not work'}
      >
        <Callout tone="error" role="alert" className="text-left">
          <p>{state.message}</p>
        </Callout>
        <p className="t-body c-ink-2">
          {state.taken
            ? 'Use a different address. Your email has not changed.'
            : 'Links work for 24 hours and only once. Ask for a new one.'}
        </p>
        {signedIn ? (
          <Link href={back.href} className="btn btn-primary">
            {back.label}
          </Link>
        ) : settled ? (
          <>
            <p className="t-small c-ink-2">Sign in to send a new link from setup or Settings.</p>
            <InstagramButton />
          </>
        ) : null}
      </StatusCard>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {signedIn ? <SetupTopbar me={signedIn} /> : <SiteHeader />}
      <main id="main" className="status-page">
        {body}
      </main>
      {signedIn ? null : <SiteFooter />}
    </div>
  );
}
