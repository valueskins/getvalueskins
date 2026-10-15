'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { computeBreakdown, formatInr, GST_RATE_BPS } from '@valueskins/shared';
import { decideAccess } from '@/lib/access';
import { useConfig, useMe } from '@/lib/api/queries';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Money } from '@/components/ui/Money';
import { InstagramButton } from './InstagramButton';

const EXAMPLE_BUDGET_PAISE = 10_000_00;

export const DEAL_STEPS = [
  { label: 'Posted', line: 'Brief, amount and dates.' },
  { label: 'Creator confirmed', line: 'The brand picks one applicant.' },
  { label: 'Fee paid', line: 'The ValueSkins fee, through Razorpay.' },
  { label: 'Advance confirmed', line: '30% by UPI, confirmed by the creator.' },
  { label: 'Content shared', line: 'A Google Drive link.' },
  { label: 'Review', line: 'Approve, or ask for changes.' },
  { label: 'Approved', line: 'The brand signs off.' },
  { label: 'Final confirmed', line: '70% by UPI, confirmed by the creator.' },
  { label: 'Completed', line: 'Both download the deal record.' },
];

function Line({
  label,
  sub,
  paise,
  strong,
}: {
  label: string;
  sub?: string;
  paise: number;
  strong?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5">
      <p className={strong ? 't-body font-semibold' : 't-body'}>{label}</p>
      <Money
        paise={paise}
        size="m"
        className={strong ? 'text-right font-semibold' : 'text-right'}
      />
      {sub ? <p className="t-small c-ink-3">{sub}</p> : null}
    </div>
  );
}

/** Sends a signed-in visitor on to where they start. The page shows straight away for everyone else. */
function SignedInRedirect() {
  const router = useRouter();
  const me = useMe();
  useEffect(() => {
    if (!me.isSuccess) return;
    const decision = decideAccess(me.data, 'home');
    if (decision.kind === 'redirect') router.replace(decision.to);
  }, [me.isSuccess, me.data, router]);
  return null;
}

export function HomePage() {
  const config = useConfig();
  const gstRateBps = config.data?.gstRateBps ?? GST_RATE_BPS;
  const b = computeBreakdown(EXAMPLE_BUDGET_PAISE, gstRateBps);
  const gstPercent = gstRateBps / 100;
  const fee = formatInr(b.commissionTotalPaise);

  return (
    <>
      <SignedInRedirect />
      <section
        aria-labelledby="hero-title"
        className="mx-auto grid max-w-page items-center gap-10 px-4 pb-10 pt-8 md:px-8 md:pb-[88px] md:pt-[72px] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-[72px]"
      >
        <div className="flex flex-col gap-6 md:gap-8">
          <h1
            id="hero-title"
            className="m-0 max-w-[14ch] text-[34px] font-semibold leading-[40px] tracking-[-0.02em] md:text-[52px] md:leading-[58px] md:tracking-[-0.025em]"
          >
            Where creators and brands connect to collaborate.
          </h1>
          <div className="grid max-w-[560px] gap-4 sm:grid-cols-2 sm:gap-6">
            <div className="flex flex-col gap-1 border-t-2 border-ink pt-3">
              <p className="t-small font-semibold">Brands</p>
              <p className="t-body c-ink-2">Post a deal. Select a creator. Pay. Done.</p>
            </div>
            <div className="flex flex-col gap-1 border-t-2 border-ink pt-3">
              <p className="t-small font-semibold">Creators</p>
              <p className="t-body c-ink-2">Browse deals. Apply. Deliver. Get paid.</p>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:items-start">
            <InstagramButton large />
            <p className="t-small c-ink-2">
              Your Instagram account must be public and a Business or Creator account.
            </p>
            {config.data?.authEmailEnabled ? (
              <Link href="/signin/email" className="btn btn-text btn-sm self-start px-0">
                Sign in with email
              </Link>
            ) : null}
          </div>
        </div>

        <div
          className="card overflow-hidden"
          aria-label={`Example: a ${formatInr(EXAMPLE_BUDGET_PAISE)} deal`}
        >
          <div className="flex flex-col gap-3 px-4 py-4 md:px-6 md:py-5">
            <div className="flex items-center justify-between gap-3">
              <p className="t-small c-ink-2">Example deal</p>
              <p className="t-mono t-small c-ink-3">8K2M4QXZ</p>
            </div>
            <p className="t-h3">Festive kurta try-on reel</p>
            <div className="hidden flex-col gap-2 sm:flex">
              <div className="flex items-center gap-2.5">
                <p className="t-label c-ink-2 w-14">Brand</p>
                <span className="chip">
                  <Avatar name="urbanthreads.in" size={24} />
                  <span className="chip-name">@urbanthreads.in</span>
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <p className="t-label c-ink-2 w-14">Creator</p>
                <span className="chip">
                  <Avatar name="riya.eats" size={24} />
                  <span className="chip-name">@riya.eats</span>
                </span>
              </div>
            </div>
          </div>
          <div className="hr" />
          <div className="flex flex-col gap-3.5 px-4 py-4 md:px-6">
            <Line label="Budget" sub="Fixed by the brand. No negotiation." paise={b.budgetPaise} />
            <Line
              label="ValueSkins fee"
              sub={`${formatInr(b.commissionBasePaise)} + GST ${formatInr(b.commissionGstPaise)}, through Razorpay`}
              paise={b.commissionTotalPaise}
            />
            <Line
              label="To the creator, 30%"
              sub="By UPI, before work starts"
              paise={b.advancePaise}
            />
            <Line
              label="To the creator, 70%"
              sub="By UPI, after the brand approves"
              paise={b.finalPaise}
            />
          </div>
          <div className="hr" />
          <div className="px-4 py-3.5 md:px-6">
            <Line label="The creator receives" paise={b.creatorAmountPaise} strong />
          </div>
          <div className="border-t border-rule bg-page px-4 pb-4 pt-3 md:px-6">
            <p className="t-small c-ink-2">
              The brand pays the creator straight from its UPI app. ValueSkins never holds the
              creator&apos;s money.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="runs-title" className="border-y border-rule bg-surface">
        <div className="mx-auto flex max-w-page flex-col gap-8 px-4 py-8 md:px-8 md:py-16">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 id="runs-title" className="t-h1">
              How a deal runs
            </h2>
            <Link href="/how-it-works" className="btn btn-secondary hidden md:inline-flex">
              Read how it works
              <Icon name="arrowRight" />
            </Link>
          </div>
          <ol className="m-0 grid list-none gap-0 p-0 md:grid-cols-9 md:gap-1.5">
            {DEAL_STEPS.map((s) => (
              <li
                key={s.label}
                className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 border-t border-rule py-2.5 md:flex md:flex-col md:gap-2.5 md:border-0 md:py-0"
              >
                <span
                  className="h-full min-h-9 w-1 justify-self-center rounded-sm bg-ink md:h-1 md:min-h-0 md:w-full"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-[13px] font-semibold leading-[18px] md:font-medium">
                    {s.label}
                  </p>
                  <p className="t-small c-ink-2 text-[13px] leading-[18px]">{s.line}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link href="/how-it-works" className="btn btn-secondary btn-block md:hidden">
            Read how it works
          </Link>
        </div>
      </section>

      <section
        aria-labelledby="cost-title"
        className="mx-auto grid max-w-page items-start gap-4 px-4 py-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-[72px] md:px-8 md:pb-[88px] md:pt-[72px]"
      >
        <div className="flex flex-col gap-2">
          <h2 id="cost-title" className="t-h2">
            What it costs
          </h2>
          <Money
            paise={b.commissionTotalPaise}
            className="text-[44px] font-medium leading-[52px] md:text-[56px] md:leading-[64px]"
          />
          <p className="t-body c-ink-2">per deal, paid by the brand</p>
        </div>
        <div className="flex max-w-[56ch] flex-col gap-4 md:pt-10">
          <p className="t-body">
            {formatInr(b.commissionBasePaise)} plus {gstPercent}% GST, the same on every deal
            whatever its size. It comes out of the deal amount, and the brand gets a GST tax invoice
            for it.
          </p>
          <p className="t-body">
            Signing up, browsing deals and applying are free. ValueSkins receives this fee of {fee}{' '}
            and nothing else.
          </p>
        </div>
      </section>
    </>
  );
}
