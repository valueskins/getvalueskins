'use client';

import { type MeResponse, type OnboardingStep, meResponseSchema } from '@valueskins/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/temporary/api';
import { BillingForm } from './onboarding/BillingForm';
import { EmailForm } from './onboarding/EmailForm';
import { InstagramUsernameForm } from './onboarding/InstagramUsernameForm';
import { PayoutSection } from './onboarding/PayoutSection';
import { RoleForm } from './onboarding/RoleForm';
import { errorClass, headingClass, hintClass, primaryButton } from './styles';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error' }
  | { kind: 'ready'; me: MeResponse };

const STEP_LABEL: Record<OnboardingStep, string> = {
  instagram_username: 'Instagram username',
  role: 'Account type',
  email: 'Verified email',
  billing: 'Billing details',
  payout: 'Payout setup',
};

/** Temporary onboarding page (SPEC 6.4): shows the step the API says is next. */
export function OnboardingView() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    try {
      const response = await apiFetch('/api/me');
      if (response.status === 401) return setState({ kind: 'signed-out' });
      if (!response.ok) return setState({ kind: 'error' });
      const parsed = meResponseSchema.safeParse(await response.json());
      setState(parsed.success ? { kind: 'ready', me: parsed.data } : { kind: 'error' });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      <h1 className={headingClass}>Set up your account</h1>

      {profile ? (
        <section className="space-y-2" aria-label="Confirm profile">
          <p className="text-muted">Is this you?</p>
          <div className="flex items-center gap-4">
            {profile.profilePictureUrl ? (
              <img
                src={profile.profilePictureUrl}
                alt={`Profile picture of ${profile.username}`}
                width={56}
                height={56}
                className="h-14 w-14 rounded border border-line object-cover"
              />
            ) : null}
            <div>
              <p className="font-semibold">@{profile.username}</p>
              <p className={hintClass}>
                {profile.name}
                {profile.followersCount !== null
                  ? `, ${profile.followersCount.toLocaleString('en-IN')} followers`
                  : ''}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <ol className="space-y-1" aria-label="Steps">
        {onboarding.steps.map((step) => (
          <li key={step.id} className={step.done ? 'text-muted' : ''}>
            {step.done ? 'Done' : step.required ? 'To do' : 'Optional'}: {STEP_LABEL[step.id]}
          </li>
        ))}
      </ol>

      {onboarding.nextStep === 'instagram_username' ? (
        <InstagramUsernameForm onDone={load} />
      ) : null}
      {onboarding.nextStep === 'role' ? <RoleForm onDone={load} /> : null}
      {onboarding.nextStep === 'email' ? <EmailForm /> : null}
      {onboarding.nextStep === 'billing' ? <BillingForm onDone={load} /> : null}

      {onboarding.completed ? (
        <div className="space-y-6">
          <p>Your account is set up.</p>
          {user.role === 'CREATOR' ? <PayoutSection /> : null}
          <Link href="/me" className={primaryButton}>
            Go to your account
          </Link>
        </div>
      ) : null}
    </div>
  );
}
