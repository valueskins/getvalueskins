'use client';

import { type MeResponse, meResponseSchema } from '@valueskins/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch, apiUrl } from '../../../lib/temporary/api';
import { errorClass, headingClass, hintClass, primaryButton, secondaryButton } from './styles';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error' }
  | { kind: 'ready'; me: MeResponse };

function formatCount(value: number | null): string {
  return value === null ? 'Not available' : value.toLocaleString('en-IN');
}

export function MeView() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/me')
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) {
          setState({ kind: 'signed-out' });
          return;
        }
        if (!response.ok) {
          setState({ kind: 'error' });
          return;
        }
        const parsed = meResponseSchema.safeParse(await response.json());
        setState(parsed.success ? { kind: 'ready', me: parsed.data } : { kind: 'error' });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function logOut() {
    setActionError(null);
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
    } catch {
      setActionError('Could not log out. Try again.');
    }
  }

  async function deleteAccount() {
    const confirmed = window.confirm(
      'Delete your account? Your profile details are removed. Deals and payment records are kept as a legal record.',
    );
    if (!confirmed) return;
    setActionError(null);
    try {
      const response = await apiFetch('/api/me', { method: 'DELETE' });
      if (!response.ok) {
        setActionError('Could not delete the account. Try again.');
        return;
      }
      router.push('/');
    } catch {
      setActionError('Could not delete the account. Try again.');
    }
  }

  if (state.kind === 'loading') return <p className={hintClass}>Loading</p>;

  if (state.kind === 'signed-out') {
    return (
      <div className="space-y-4">
        <h1 className={headingClass}>You are signed out</h1>
        <Link href="/" className={primaryButton}>
          Go to sign in
        </Link>
      </div>
    );
  }

  if (state.kind === 'error') {
    return <p className={errorClass}>Could not load your account. Reload the page to try again.</p>;
  }

  const { user, profile, onboarding } = state.me;

  return (
    <div className="space-y-8">
      <h1 className={headingClass}>Your account</h1>

      {profile ? (
        <section className="space-y-4" aria-label="Instagram profile">
          <h2 className="text-xl font-semibold">Your Instagram profile</h2>
          <p className={hintClass}>
            ValueSkins uses your Instagram username, name, picture, follower count, post count and
            engagement rate to build your creator profile. Brands see it when you apply to a deal.
          </p>
          <div className="flex items-center gap-4">
            {profile.profilePictureUrl ? (
              // Plain img: Instagram CDN URLs, no image optimisation needed here.
              <img
                src={profile.profilePictureUrl}
                alt={`Profile picture of ${profile.username}`}
                width={72}
                height={72}
                className="h-[72px] w-[72px] rounded border border-line object-cover"
              />
            ) : null}
            <div>
              <p className="text-lg font-semibold">@{profile.username}</p>
              <p className="text-muted">{profile.name}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4">
            <div>
              <dt className={hintClass}>Followers</dt>
              <dd>{formatCount(profile.followersCount)}</dd>
            </div>
            <div>
              <dt className={hintClass}>Posts</dt>
              <dd>{formatCount(profile.mediaCount)}</dd>
            </div>
            <div>
              <dt className={hintClass}>Engagement rate</dt>
              <dd>
                {profile.engagementRate === null
                  ? 'Not enough posts yet'
                  : `${profile.engagementRate.toFixed(2)}%`}
              </dd>
            </div>
          </dl>
        </section>
      ) : (
        <section className="space-y-3">
          <p>No Instagram account is linked to this account.</p>
          <a href={apiUrl('/api/auth/instagram/start?link=1')} className={secondaryButton}>
            Link Instagram
          </a>
        </section>
      )}

      {user.email ? <p className={hintClass}>Email: {user.email}</p> : null}

      <Link href="/onboarding" className={secondaryButton}>
        {onboarding.completed ? 'Account setup' : 'Continue account setup'}
      </Link>

      <div className="flex flex-col gap-3">
        <button type="button" onClick={logOut} className={secondaryButton}>
          Log out
        </button>
        <button type="button" onClick={deleteAccount} className={secondaryButton}>
          Delete my account
        </button>
      </div>
      {actionError ? <p className={errorClass}>{actionError}</p> : null}
    </div>
  );
}
