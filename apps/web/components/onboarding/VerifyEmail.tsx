'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { isOnboarded } from '@/lib/access';
import { errorText, isApiError } from '@/lib/api/errors';
import { useMe, useVerifyEmail } from '@/lib/api/queries';
import { Callout } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { SiteFooter, SiteHeader } from '@/components/shell/SiteChrome';
import { SetupTopbar } from '@/components/shell/SetupTopbar';
import { InstagramButton } from '@/components/public/InstagramButton';

type State =
  | { kind: 'working' }
  | { kind: 'done' }
  | { kind: 'signed-out' }
  | { kind: 'failed'; message: string; taken: boolean };

/**
 * The link in the verification email (SPEC 6.4). The token belongs to the
 * signed-in user, so a signed-out visitor is asked to sign in first and open
 * the link again.
 */
export function VerifyEmail() {
  const token = useSearchParams()?.get('token') ?? '';
  const me = useMe();
  const verify = useVerifyEmail();
  const [state, setState] = useState<State>({ kind: 'working' });
  const started = useRef(false);

  useEffect(() => {
    if (!me.isSuccess || started.current) return;
    started.current = true;
    if (!me.data) {
      setState({ kind: 'signed-out' });
      return;
    }
    if (token.length < 20) {
      setState({ kind: 'failed', message: 'This link is invalid or has expired.', taken: false });
      return;
    }
    verify.mutate(token, {
      onSuccess: () => {
        setState({ kind: 'done' });
      },
      onError: (err) => {
        if (isApiError(err) && err.status === 401) setState({ kind: 'signed-out' });
        else
          setState({
            kind: 'failed',
            message: errorText(err),
            taken: isApiError(err, 'EMAIL_TAKEN'),
          });
      },
    });
  }, [me.isSuccess, me.data, token, verify]);

  const signedIn = me.data ?? null;
  const back =
    signedIn && isOnboarded(signedIn)
      ? { href: '/settings', label: 'Go to Settings' }
      : { href: '/onboarding', label: 'Continue' };

  let body: React.ReactNode;
  if (state.kind === 'working') body = <PageSkeleton />;
  else if (state.kind === 'signed-out')
    body = (
      <>
        <h1 className="t-h1">Sign in to confirm your email</h1>
        <p className="t-body c-ink-2">
          The link works only for the account that asked for it. Sign in with Instagram, then open
          the link in the email again.
        </p>
        <div>
          <InstagramButton />
        </div>
      </>
    );
  else if (state.kind === 'done')
    body = (
      <>
        <p className="t-label c-ink-2">Email</p>
        <h1 className="t-h1">Email confirmed</h1>
        <div className="card flex flex-col gap-4 p-5 md:p-6" role="status">
          <p className="t-body flex items-center gap-2">
            <span className="text-success">
              <Icon name="checkCircle" />
            </span>
            {signedIn?.user.email ? (
              <>
                <strong className="font-semibold">{signedIn.user.email}</strong> is verified.
              </>
            ) : (
              'Your email is verified.'
            )}
          </p>
          <p className="t-body c-ink-2">
            Deal updates, payment confirmations and documents will go to this address. You can
            change it later in Settings.
          </p>
          <div>
            <Link href={back.href} className="btn btn-primary">
              {back.label}
            </Link>
          </div>
        </div>
      </>
    );
  else
    body = (
      <>
        <h1 className="t-h1">
          {state.taken ? 'That email is already used' : 'This link did not work'}
        </h1>
        <Callout tone="error" role="alert">
          <p>{state.message}</p>
        </Callout>
        <p className="t-body c-ink-2">
          {state.taken
            ? 'Use a different address. Your email has not changed.'
            : 'Links work for 24 hours and only once. Ask for a new one.'}
        </p>
        <div>
          <Link href={back.href} className="btn btn-primary">
            {signedIn && isOnboarded(signedIn) ? 'Go to Settings' : 'Back to setup'}
          </Link>
        </div>
      </>
    );

  return (
    <div className="flex min-h-screen flex-col">
      {signedIn ? <SetupTopbar me={signedIn} /> : <SiteHeader />}
      <main
        id="main"
        className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-5 px-4 pb-20 pt-10 md:pt-16"
      >
        {body}
      </main>
      {signedIn ? null : <SiteFooter />}
    </div>
  );
}
