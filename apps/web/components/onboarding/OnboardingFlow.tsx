'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACCOUNT_TYPE_UNSUPPORTED,
  CONNECT_INSTAGRAM_TO_CONTINUE,
  type MeResponse,
} from '@valueskins/shared';
import { previewResume, type ProfileDraft } from '@/lib/previewResume';
import { instagramConfirmed } from '@/lib/sessionMemory';
import { Button, LinkButton } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { Stepper, type StepperItem } from '@/components/ui/Stepper';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { BillingForm } from '@/components/forms/BillingForm';
import { ProfileForm } from '@/components/forms/ProfileForm';
import { UpiForm } from '@/components/forms/UpiForm';
import { InstagramButton } from '@/components/public/InstagramButton';
import { ResumeContent } from '@/components/resume/ResumeContent';
import { SIGNING_OUT_REASON, useSignOut } from '@/components/shell/useSignOut';
import { EmailForm, EmailSent, useEmailFlow } from './EmailStep';
import { InstagramSummary } from './InstagramSummary';
import { WhoSeesWhat } from './WhoSeesWhat';

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
      <p className="t-label c-ink-2 onb-step-n">Step {n} of 4</p>
      <h1 id="step-title" className="t-h1" tabIndex={-1}>
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
  const [finished, setFinished] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const onDraft = useCallback((d: ProfileDraft) => setDraft(d), []);
  const stepRef = useRef<HTMLElement>(null);
  const email = useEmailFlow(me);

  // sessionStorage is read after mount, so the server and first render agree.
  useEffect(() => {
    setConfirmed(instagramConfirmed.get(userId) || email.sentTo !== null);
    setReady(true);
  }, [userId, email.sentTo]);

  const screen = screenFor(me, confirmed);

  useEffect(() => {
    if (ready && screen === 'done' && !finished) router.replace('/home');
  }, [ready, screen, finished, router]);

  // Each new step puts focus on its first field, or on its heading when it has none.
  const sentTo = email.sentTo;
  useEffect(() => {
    if (!ready || finished) return;
    const root = stepRef.current;
    if (!root) return;
    const target =
      root.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea') ??
      root.querySelector<HTMLElement>('h1');
    target?.focus({ preventScroll: false });
  }, [ready, finished, screen, sentTo]);

  if (finished) return <Finished me={me} />;
  if (!ready || screen === 'done') return <PageSkeleton />;

  const finish = () => setFinished(true);

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
          <p className="t-small c-ink-2 onb-why">
            <Icon name="info" size={16} />
            Deal updates and documents go here. It is also your contact on your profile.
          </p>
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
          <ProfileForm
            role={me.user.role!}
            onSaved={() => email.setSentTo(null)}
            onChange={onDraft}
          />
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

  const index = SCREEN_INDEX[screen] ?? 0;
  const items = stepperItems(me, screen);
  const showPreview = screen !== 'connect' && screen !== 'instagram';
  const role = me.user.role ?? 'CREATOR';
  const preview = (
    <>
      <div className="onb-preview" inert aria-label="Preview of your profile" role="img">
        <ResumeContent data={previewResume(me, draft)} />
      </div>
      <WhoSeesWhat role={role} />
    </>
  );

  return (
    <div className="onb">
      <div className="onb-progress" aria-hidden="true">
        <p className="t-small">
          <span className="font-semibold">Step {index + 1} of 4:</span> {items[index]?.label}
        </p>
        <div className="seg seg-4">
          {items.map((item) => (
            <span
              key={item.label}
              className={
                item.state === 'done' ? 'done' : item.state === 'current' ? 'current' : undefined
              }
            />
          ))}
        </div>
      </div>

      <nav aria-label="Setup steps" className="onb-rail">
        <p className="t-small font-semibold">Set up your account</p>
        <Stepper items={items} label="Steps" />
        <p className="t-small c-ink-2">{stepNote(me, screen)}</p>
        <p className="t-small c-ink-3">Signed in as @{me.user.username}</p>
      </nav>

      <section
        key={screen + (email.sentTo ? '-sent' : '')}
        ref={stepRef}
        aria-labelledby="step-title"
        className="onb-step"
      >
        {body}
        {showPreview ? (
          <details className="onb-preview-fold" open={screen === 'profile'}>
            <summary>
              Preview your profile
              <Icon name="caretDown" size={16} />
            </summary>
            {preview}
          </details>
        ) : null}
      </section>

      {showPreview ? (
        <aside className="onb-side" aria-label="Your profile preview">
          <p className="t-label c-ink-2">
            {role === 'BRAND' ? 'How creators see you' : 'How brands see you'}
          </p>
          {preview}
        </aside>
      ) : null}
    </div>
  );
}

/** The last moment of setup: the profile as others see it, and the one next thing to do. */
function Finished({ me }: { me: MeResponse }) {
  const isBrand = me.user.role === 'BRAND';
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="onb-done">
      <span className="onb-done-check" aria-hidden="true">
        <Icon name="check" size={24} />
      </span>
      <h1 ref={heading} tabIndex={-1} className="t-display">
        You are set up
      </h1>
      <p className="t-body c-ink-2 onb-done-lede">
        {isBrand
          ? 'Creators can now see your brand profile. Post a deal and they can apply.'
          : 'Brands can now see your profile when you apply. Every open deal is yours to apply to.'}
      </p>
      <div className="onb-preview onb-done-card" inert aria-label="Your profile" role="img">
        <ResumeContent data={previewResume(me, null)} />
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {isBrand ? (
          <>
            <LinkButton href="/campaigns/new">
              <Icon name="plus" />
              Post your first deal
            </LinkButton>
            <LinkButton href="/campaigns" variant="text">
              Go to Campaigns
            </LinkButton>
          </>
        ) : (
          <>
            <LinkButton href="/deals">
              See open deals
              <Icon name="arrowRight" />
            </LinkButton>
            <LinkButton href="/settings" variant="text">
              Go to Settings
            </LinkButton>
          </>
        )}
      </div>
    </div>
  );
}

function SignOutLink() {
  const { signOut, pending } = useSignOut();
  return (
    <Button variant="text" onClick={signOut} disabledReason={pending ? SIGNING_OUT_REASON : null}>
      Not you? Sign out
    </Button>
  );
}
