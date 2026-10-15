'use client';

import Link from 'next/link';
import { ACCOUNT_TYPE_UNSUPPORTED } from '@valueskins/shared';
import { Icon } from '@/components/ui/Icon';
import { SupportEmail, useSupportEmail } from '@/components/shell/SupportEmail';
import { InstagramButton } from './InstagramButton';

/** The ?error= codes the API's Instagram callback sends to /login (SPEC 6.1). */
export const SIGN_IN_ERROR_CODES = [
  'state_invalid',
  'instagram_failed',
  'account_type_unsupported',
  'account_type_change_blocked',
  'must_be_logged_in',
  'account_linked_elsewhere',
] as const;

function Stopped() {
  return (
    <span className="badge badge-error self-start">
      <Icon name="warningCircle" />
      Sign-in stopped
    </span>
  );
}

function Actions({ primary = 'Sign in with Instagram' }: { primary?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <InstagramButton label={primary} />
      <Link href="/" className="btn btn-text">
        Back to home
      </Link>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-7 px-4 pb-[88px] pt-10 md:px-8 md:pt-16">
      {children}
    </div>
  );
}

const HOW_TO_SWITCH = [
  <>
    Open Instagram, go to your profile and tap the menu at the top to open{' '}
    <strong>Settings and activity</strong>.
  </>,
  <>
    Under <strong>For professionals</strong>, tap <strong>Account type and tools</strong>.
  </>,
  <>
    Tap <strong>Switch to professional account</strong> and pick any category.
  </>,
  <>
    Choose <strong>Creator</strong> if you will apply to deals, or <strong>Business</strong> if you
    will post them. Tap Next.
  </>,
  <>Come back here and sign in again.</>,
];

function PersonalAccount() {
  return (
    <Shell>
      <div className="flex flex-col gap-3">
        <Stopped />
        <h1 className="t-h1">This Instagram account cannot sign in</h1>
        <p className="t-body c-ink-2">{ACCOUNT_TYPE_UNSUPPORTED}</p>
        <p className="t-body c-ink-2">
          The account you used is a personal account. Switching takes about a minute and is free.
        </p>
      </div>
      <section className="card flex flex-col gap-4 p-5 md:p-6" aria-labelledby="howto-title">
        <h2 id="howto-title" className="t-h3">
          How to switch
        </h2>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {HOW_TO_SWITCH.map((step, i) => (
            <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-3">
              <span className="t-mono grid h-7 w-7 place-items-center rounded-sm bg-ink text-[13px] text-white">
                {i + 1}
              </span>
              <p className="t-body">{step}</p>
            </li>
          ))}
        </ol>
        <div className="callout callout-info">
          <Icon name="info" />
          <p>
            If your account is private, switching makes it public. Instagram accepts any pending
            follow requests when that happens.
          </p>
        </div>
      </section>
      <Actions />
      <p className="t-small c-ink-2">
        Still stuck? Write to <SupportEmail />.
      </p>
    </Shell>
  );
}

function RoleChanged() {
  const support = useSupportEmail();
  return (
    <Shell>
      <div className="flex flex-col gap-3">
        <Stopped />
        <h1 className="t-h1">Your account type changed</h1>
        <p className="t-body c-ink-2">
          Your Instagram account type changed, but this account already has deals or applications.
          Write to {support} and we will sort it out.
        </p>
      </div>
      <section className="card flex flex-col gap-4 p-5 md:p-6" aria-labelledby="why-title">
        <h2 id="why-title" className="t-h3">
          Why this happened
        </h2>
        <p className="t-body c-ink-2">
          On ValueSkins your role comes from your Instagram account type. A Business account is a
          brand. A Creator account is a creator. Deals and applications belong to one role, so we
          cannot move them across on our own.
        </p>
        <div className="hr" />
        <h2 className="t-h3">What you can do</h2>
        <ul className="m-0 flex flex-col gap-2 pl-5">
          <li className="t-body">
            Switch your Instagram account back to its old type, then sign in again. Everything here
            stays as it was.
          </li>
          <li className="t-body">Or write to us. A person reads every email.</li>
        </ul>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <SupportEmail className="btn btn-primary">
          <Icon name="envelope" />
          Write to us
        </SupportEmail>
        <InstagramButton label="Sign in again" variant="secondary" />
      </div>
    </Shell>
  );
}

const GENERIC: Record<string, { title: string; lines: string[] }> = {
  instagram_failed: {
    title: 'Sign-in did not finish',
    lines: [
      'Instagram sign-in did not complete. Start again.',
      'This happens if you cancelled on Instagram, took longer than 5 minutes, or opened the sign-in in a different browser.',
    ],
  },
  state_invalid: {
    title: 'Sign-in did not finish',
    lines: [
      'The sign-in expired or was opened in a different browser. Start again from the first page.',
    ],
  },
  must_be_logged_in: {
    title: 'Sign in first',
    lines: ['Sign in first, then connect your Instagram account.'],
  },
  account_linked_elsewhere: {
    title: 'That Instagram account is already used',
    lines: ['That Instagram account is already linked to a different ValueSkins account.'],
  },
};

const FALLBACK = {
  title: 'Sign-in did not finish',
  lines: ['Something went wrong while signing in. Start again.'],
};

function Generic({ code }: { code: string }) {
  const copy = (Object.hasOwn(GENERIC, code) ? GENERIC[code] : undefined) ?? FALLBACK;
  return (
    <Shell>
      <div className="flex flex-col gap-3">
        <h1 className="t-h1">{copy.title}</h1>
        {copy.lines.map((line) => (
          <p key={line} className="t-body c-ink-2">
            {line}
          </p>
        ))}
      </div>
      <Actions />
      <p className="t-small c-ink-2">
        If it keeps happening, write to <SupportEmail /> and say what you see.
      </p>
    </Shell>
  );
}

/** The page for /login?error=<code>. */
export function SignInError({ code }: { code: string }) {
  if (code === 'account_type_unsupported') return <PersonalAccount />;
  if (code === 'account_type_change_blocked') return <RoleChanged />;
  return <Generic code={code} />;
}
