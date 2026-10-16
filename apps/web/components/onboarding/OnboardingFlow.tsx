'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ACCOUNT_TYPE_UNSUPPORTED,
  CONNECT_INSTAGRAM_TO_CONTINUE,
  type MeResponse,
} from '@valueskins/shared';
import { instagramConfirmed } from '@/lib/sessionMemory';
import { Button, LinkButton } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Stepper, type StepperItem } from '@/components/ui/Stepper';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { BillingForm } from '@/components/forms/BillingForm';
import { ProfileForm } from '@/components/forms/ProfileForm';
import { UpiForm } from '@/components/forms/UpiForm';
import { InstagramButton } from '@/components/public/InstagramButton';
import { useSignOut } from '@/components/shell/useSignOut';
import { EmailForm, EmailSent, useEmailFlow } from './EmailStep';
import { InstagramSummary } from './InstagramSummary';

/** Why connecting Instagram failed, from the API's ?error= code (SPEC 6.1). */
const CONNECT_ERRORS: Record<string, string> = {
  account_linked_elsewhere:
    'That Instagram account is already linked to a different ValueSkins account.',
  account_type_unsupported: ACCOUNT_TYPE_UNSUPPORTED,
};

export type ScreenId =
  'connect' | 'instagram' | 'email' | 'profile' | 'billing' | 'payout' | 'done';

function stepDone(me: MeResponse, id: MeResponse['onboarding']['steps'][number]['id']): boolean {
  return me.onboarding.steps.find((s) => s.id === id)?.done ?? false;
}

/**
 * Which screen to show, from GET /me. The API decides what is done; the web
 * only adds the "This is me" confirmation, which the API does not record. A
 * creator's UPI step is optional, so it stays open after onboarding completes.
 */
export function screenFor(me: MeResponse, confirmedInstagram: boolean): ScreenId {
  if (!stepDone(me, 'instagram') || me.user.role === null) return 'connect';
  const emailDone = stepDone(me, 'email');
  if (!emailDone && !confirmedInstagram) return 'instagram';
  if (!emailDone) return 'email';
  if (!stepDone(me, 'profile')) return 'profile';
  if (me.user.role === 'BRAND') return stepDone(me, 'billing') ? 'done' : 'billing';
  return stepDone(me, 'payout') ? 'done' : 'payout';
}

const SCREEN_INDEX: Partial<Record<ScreenId, number>> = {
  connect: 0,
  instagram: 0,
  email: 1,
  profile: 2,
  billing: 3,
  payout: 3,
};

function stepperItems(me: MeResponse, screen: ScreenId): StepperItem[] {
  const isBrand = me.user.role === 'BRAND';
  const current = SCREEN_INDEX[screen] ?? -1;
  const done = [
    stepDone(me, 'instagram') && current > 0,
    stepDone(me, 'email'),
    stepDone(me, 'profile'),
    stepDone(me, isBrand ? 'billing' : 'payout'),
  ];
  const labels = [
    'Your Instagram',
    'Email',
    'Your profile',
    isBrand ? 'Billing details' : 'Get paid by UPI',
  ];
  return labels.map((label, i) => ({
    label,
    state: i === current ? 'current' : done[i] ? 'done' : 'todo',
    tag: !isBrand && i === 3 ? 'To apply' : undefined,
  }));
}

function stepNote(me: MeResponse, screen: ScreenId): string {
  if (me.user.role === 'BRAND') return 'All four steps are needed before you can publish a deal.';
  if (screen === 'payout') return 'Setup is done. Add a UPI ID now, or later before you apply.';
  return 'You can browse deals after step 3. You need step 4 to apply.';
}

function Heading({ n, title, lede }: { n: number; title: string; lede?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="t-label c-ink-2">Step {n} of 4</p>
      <h1 id="step-title" className="t-h1">
        {title}
      </h1>
      {lede ? <p className="t-body c-ink-2">{lede}</p> : null}
    </div>
  );
}

export function OnboardingFlow({ me }: { me: MeResponse }) {
  const router = useRouter();
  const linkError = useSearchParams()?.get('error') ?? null;
  const userId = me.user.id;
  const [confirmed, setConfirmed] = useState(false);
  const [ready, setReady] = useState(false);
  const email = useEmailFlow(me);

  // sessionStorage is read after mount, so the server and first render agree.
  useEffect(() => {
    setConfirmed(instagramConfirmed.get(userId) || email.sentTo !== null);
    setReady(true);
  }, [userId, email.sentTo]);

  const screen = screenFor(me, confirmed);

  useEffect(() => {
    if (ready && screen === 'done') router.replace('/home');
  }, [ready, screen, router]);

  if (!ready || screen === 'done') return <PageSkeleton />;

  const finish = () => router.replace('/home');

  let body: React.ReactNode;
  switch (screen) {
    case 'connect':
      body = (
        <>
          <Heading
            n={1}
            title="Connect your Instagram"
            lede="Your role on ValueSkins comes from your Instagram account type. A Business account is a brand. A Creator account is a creator."
          />
          {linkError ? (
            <Callout tone="error" role="alert">
              <p>
                {CONNECT_ERRORS[linkError] ?? 'Connecting Instagram did not finish. Try again.'}
              </p>
            </Callout>
          ) : null}
          <div className="card flex flex-col gap-4 p-5 md:p-6">
            <p className="t-body">{CONNECT_INSTAGRAM_TO_CONTINUE}</p>
            <p className="t-small c-ink-2">
              Your Instagram account must be public and a Business or Creator account.
            </p>
            <div>
              <InstagramButton label="Connect Instagram" link />
            </div>
          </div>
        </>
      );
      break;
    case 'instagram':
      body = (
        <>
          <Heading
            n={1}
            title="Is this you?"
            lede="We read this from Instagram. It refreshes each time you sign in."
          />
          {me.profile ? <InstagramSummary profile={me.profile} /> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => {
                instagramConfirmed.set(userId);
                setConfirmed(true);
              }}
            >
              This is me
            </Button>
            <SignOutLink />
          </div>
        </>
      );
      break;
    case 'email':
      body = email.sentTo ? (
        <>
          <Heading n={2} title="Check your inbox" />
          <div className="card p-5 md:p-6">
            <EmailSent sentTo={email.sentTo} onDifferent={() => email.setSentTo(null)} />
          </div>
        </>
      ) : (
        <>
          <Heading
            n={2}
            title="Add your email"
            lede="We send deal updates and documents here. It also shows on your profile as your contact email."
          />
          <div className="card p-5 md:p-6">
            <EmailForm onSent={(address) => email.setSentTo(address)} />
          </div>
        </>
      );
      break;
    case 'profile':
      body = (
        <>
          {me.user.role === 'BRAND' ? (
            <Heading
              n={3}
              title="Your brand profile"
              lede="Creators see this when they read your deals and decide whether to apply."
            />
          ) : (
            <Heading
              n={3}
              title="Your profile"
              lede="Brands see these details on your profile when you apply to their deals."
            />
          )}
          <ProfileForm role={me.user.role!} onSaved={() => email.setSentTo(null)} />
        </>
      );
      break;
    case 'billing':
      body = (
        <>
          <Heading
            n={4}
            title="Billing details"
            lede="These go on the GST tax invoice for the ValueSkins fee. You can change them later in Settings."
          />
          <div className="card p-5 md:p-6">
            <BillingForm submitLabel="Save and finish" onSaved={finish} />
          </div>
        </>
      );
      break;
    case 'payout':
      body = (
        <>
          <Heading
            n={4}
            title="Get paid by UPI"
            lede="Brands pay you directly from their UPI app: 30% before you start and 70% after they approve. ValueSkins never holds your money."
          />
          <div className="card p-5 md:p-6">
            <UpiForm
              onSaved={finish}
              secondary={
                <LinkButton href="/home" variant="text">
                  Do this later
                </LinkButton>
              }
            />
          </div>
        </>
      );
      break;
  }

  return (
    <main
      id="main"
      className="mx-auto grid max-w-[1040px] items-start gap-8 px-4 pb-20 pt-8 md:grid-cols-[260px_minmax(0,1fr)] md:gap-16 md:px-8 md:pt-14"
    >
      <nav aria-label="Setup steps" className="flex flex-col gap-4">
        <p className="t-small font-semibold">Set up your account</p>
        <Stepper items={stepperItems(me, screen)} label="Steps" />
        <p className="t-small c-ink-2">{stepNote(me, screen)}</p>
      </nav>
      <section aria-labelledby="step-title" className="flex max-w-[560px] flex-col gap-6">
        {body}
      </section>
    </main>
  );
}

function SignOutLink() {
  const { signOut, pending } = useSignOut();
  return (
    <Button variant="text" onClick={signOut} loading={pending}>
      Not you? Sign out
    </Button>
  );
}
