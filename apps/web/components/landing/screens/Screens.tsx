'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { computeBreakdown, formatInr, STEP_LABELS } from '@valueskins/shared';
import { Icon } from '@/components/ui/Icon';
import { formatCount, formatPercent } from '@/lib/format';
import { useCountUp } from '../motion';
import {
  FEED_DEALS,
  OTHER_APPLICANTS,
  RECORD_DEALS,
  RECORD_TOTAL_PAISE,
  STORY_BREAKDOWN,
  STORY_CREATOR,
  STORY_DEAL,
  type ExampleApplicant,
  type ExampleDeal,
} from './data';

/*
 * The product, drawn in HTML and CSS with made-up data, for the home page. These are pictures of
 * the app: nothing in them is a real control, so they are inert, and each says it is an example.
 */

export function Monogram({
  initials,
  tone,
  size = 36,
}: {
  initials: string;
  tone: ExampleDeal['tone'];
  size?: number;
}) {
  return (
    <span
      className={`pic-mono pic-tone-${tone}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function ExamplePill() {
  return <span className="pic-example">Example</span>;
}

/** A phone with one app screen inside. */
export function Phone({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pic-phone" role="img" aria-label={label}>
      <div className="pic-phone-screen" inert>
        <div className="pic-app-bar">
          <span className="pic-app-mark">ValueSkins</span>
          <ExamplePill />
        </div>
        {children}
      </div>
    </div>
  );
}

/** A browser-like desktop panel with one app screen inside. */
export function Panel({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="pic-panel" role="img" aria-label={label}>
      <div className="pic-panel-bar" aria-hidden="true">
        <span className="pic-dot" />
        <span className="pic-dot" />
        <span className="pic-dot" />
        <p>{title}</p>
        <ExamplePill />
      </div>
      <div className="pic-panel-body" inert>
        {children}
      </div>
    </div>
  );
}

function DealCard({
  deal,
  state,
  fresh = false,
}: {
  deal: ExampleDeal;
  state?: 'open' | 'pressed' | 'applied';
  fresh?: boolean;
}) {
  return (
    <div className={fresh ? 'pic-deal is-fresh' : 'pic-deal'}>
      <div className="pic-deal-head">
        <Monogram initials={deal.initials} tone={deal.tone} size={30} />
        <div className="pic-deal-who">
          <p className="pic-deal-title">{deal.title}</p>
          <p className="pic-small">@{deal.handle}</p>
        </div>
      </div>
      <div className="pic-deal-foot">
        <div>
          <p className="pic-num">{formatInr(deal.amountPaise)}</p>
          <p className="pic-small">Apply by {deal.applyBy}</p>
        </div>
        {state === 'applied' ? (
          <span className="pic-chip pic-chip-ok">
            <Icon name="check" size={16} />
            Applied
          </span>
        ) : (
          <span className={state === 'pressed' ? 'pic-mini-btn is-pressed' : 'pic-mini-btn'}>
            Apply
          </span>
        )}
      </div>
    </div>
  );
}

/** The creator's open deals, with a new one arriving at the top. */
export function CreatorFeed({
  showNew,
  applyState,
}: {
  showNew: boolean;
  applyState: 'open' | 'pressed' | 'applied';
}) {
  // How far the list sits up before the new deal arrives: exactly one card and its gap.
  const list = useRef<HTMLDivElement>(null);
  const fresh = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState(0);
  useEffect(() => {
    const measure = () => setSlot((fresh.current?.offsetHeight ?? 0) + 8);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return (
    <div className="pic-feed">
      <p className="pic-screen-title">Open deals</p>
      <div className="pic-feed-view">
        <div
          ref={list}
          className={showNew ? 'pic-feed-list has-new' : 'pic-feed-list'}
          style={
            slot ? ({ ['--pic-slot' as string]: `${slot}px` } as React.CSSProperties) : undefined
          }
        >
          <div className="pic-feed-new" ref={fresh}>
            <DealCard deal={STORY_DEAL} state={applyState} fresh />
          </div>
          {FEED_DEALS.map((deal) => (
            <DealCard key={deal.title} deal={deal} state="open" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** "30% received" (or the 70%): the creator confirms the brand's UPI payment arrived. */
export function ReceivedCard({
  shown,
  part = 'advance',
}: {
  shown: boolean;
  part?: 'advance' | 'final';
}) {
  const target = part === 'advance' ? STORY_BREAKDOWN.advancePaise : STORY_BREAKDOWN.finalPaise;
  const amount = useCountUp(shown ? target : 0, 1100, 0);
  return (
    <div className={shown ? 'pic-received is-shown' : 'pic-received'}>
      <span className="pic-received-icon">
        <Icon name="checkCircle" size={20} />
      </span>
      <div>
        <p className="pic-received-title">{part === 'advance' ? '30% received' : '70% received'}</p>
        <p className="pic-received-amount pic-num">{formatInr(amount)}</p>
        <p className="pic-small">By UPI from @{STORY_DEAL.handle}. Confirmed by you.</p>
      </div>
    </div>
  );
}

function ApplicantRow({
  a,
  picked = false,
  fresh = false,
  shown = true,
}: {
  a: ExampleApplicant;
  picked?: boolean;
  fresh?: boolean;
  shown?: boolean;
}) {
  const cls = ['pic-applicant', fresh && 'is-fresh', shown && 'is-shown', picked && 'is-picked']
    .filter(Boolean)
    .join(' ');
  return (
    <li className={cls}>
      <span className="pic-avatar" aria-hidden="true">
        {a.name.split(' ')[1]?.[0] ?? a.name[0]}
      </span>
      <div className="pic-applicant-who">
        <p className="pic-strong">@{a.handle}</p>
        <p className="pic-small">{a.name}</p>
      </div>
      <p className="pic-num pic-col">{formatCount(a.followers)}</p>
      <p className="pic-num pic-col">{formatPercent(a.engagement)}</p>
      {picked ? (
        <span className="pic-chip pic-chip-ok">
          <Icon name="check" size={16} />
          Picked
        </span>
      ) : (
        <span className="pic-mini-btn pic-mini-btn-quiet">Pick</span>
      )}
    </li>
  );
}

/** The brand's deal page: the posted deal and who applied. */
export function BrandApplicants({ showNew, picked }: { showNew: boolean; picked: boolean }) {
  return (
    <div className="pic-brand">
      <div className="pic-brand-head">
        <Monogram initials={STORY_DEAL.initials} tone={STORY_DEAL.tone} size={40} />
        <div>
          <p className="pic-screen-title">{STORY_DEAL.title}</p>
          <p className="pic-small">
            {formatInr(STORY_DEAL.amountPaise)}, apply by {STORY_DEAL.applyBy}
          </p>
        </div>
        <span className={picked ? 'pic-chip pic-chip-ok' : 'pic-chip'}>
          {picked ? 'Creator confirmed' : 'Open'}
        </span>
      </div>
      <div className="pic-table-head" aria-hidden="true">
        <span>Applicant</span>
        <span className="pic-col">Followers</span>
        <span className="pic-col">Engagement</span>
        <span />
      </div>
      <ul className="pic-applicants">
        <ApplicantRow a={STORY_CREATOR} fresh shown={showNew} picked={picked} />
        {OTHER_APPLICANTS.map((a) => (
          <ApplicantRow key={a.handle} a={a} />
        ))}
      </ul>
    </div>
  );
}

const STATUS = {
  applied: { text: 'Applied', cls: 'pic-chip' },
  picked: { text: 'Picked', cls: 'pic-chip pic-chip-ok' },
  other: { text: 'Not selected', cls: 'pic-chip pic-chip-quiet' },
} as const;

/** The creator's Applications, with the status of each. */
export function CreatorApplications({ picked }: { picked: boolean }) {
  const rows: Array<{ deal: ExampleDeal; status: keyof typeof STATUS }> = [
    { deal: STORY_DEAL, status: picked ? 'picked' : 'applied' },
    { deal: FEED_DEALS[0]!, status: 'applied' },
    { deal: FEED_DEALS[1]!, status: 'other' },
  ];
  return (
    <div className="pic-apps">
      <p className="pic-screen-title">Your applications</p>
      <ul>
        {rows.map(({ deal, status }) => (
          <li key={deal.title} className="pic-app-row">
            <Monogram initials={deal.initials} tone={deal.tone} size={30} />
            <div className="pic-app-who">
              <p className="pic-strong">{deal.title}</p>
              <p className="pic-small">
                You receive{' '}
                <span className="pic-lime">
                  {formatInr(computeBreakdown(deal.amountPaise).creatorAmountPaise)}
                </span>
              </p>
            </div>
            <span className={STATUS[status].cls}>{STATUS[status].text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One deal in progress: the nine steps, and the two UPI payments. */
export function DealProgress({ reached }: { reached: number }) {
  const b = STORY_BREAKDOWN;
  const advanceDone = reached >= 4;
  const finalDone = reached >= 8;
  return (
    <div className="pic-progress">
      <div className="pic-brand-head">
        <Monogram initials={STORY_DEAL.initials} tone={STORY_DEAL.tone} size={36} />
        <div>
          <p className="pic-screen-title">{STORY_DEAL.title}</p>
          <p className="pic-small">
            @{STORY_DEAL.handle} and @{STORY_CREATOR.handle}
          </p>
        </div>
        <span className={reached >= 9 ? 'pic-chip pic-chip-ok' : 'pic-chip'}>
          {STEP_LABELS[Math.max(0, Math.min(reached, 9) - 1)]}
        </span>
      </div>
      <ol className="pic-steps" aria-label="Deal steps">
        {STEP_LABELS.map((label, i) => (
          <li key={label} className={i < reached ? 'is-done' : undefined}>
            <span className="pic-step-dot" aria-hidden="true" />
            <span className="pic-step-label">{label}</span>
          </li>
        ))}
      </ol>
      {/* On narrow screens the nine labels do not fit under the bar: only the current one shows. */}
      <p className="pic-step-now">
        Step {Math.max(1, Math.min(reached, STEP_LABELS.length))} of {STEP_LABELS.length}:{' '}
        <span className="pic-strong">{STEP_LABELS[Math.max(0, Math.min(reached, 9) - 1)]}</span>
      </p>
      <ul className="pic-pays">
        <li className={advanceDone ? 'is-done' : undefined}>
          <span>30% by UPI, before work</span>
          <span className="pic-num pic-lime-soft">{formatInr(b.advancePaise)}</span>
          <span className="pic-small">
            {advanceDone ? 'Confirmed by the creator' : 'Not paid yet'}
          </span>
        </li>
        <li className={finalDone ? 'is-done' : undefined}>
          <span>70% by UPI, after approval</span>
          <span className="pic-num pic-lime">{formatInr(b.finalPaise)}</span>
          <span className="pic-small">
            {finalDone ? 'Confirmed by the creator' : 'Not paid yet'}
          </span>
        </li>
      </ul>
    </div>
  );
}

/** A creator's profile and the record that grows with every finished deal. */
export function ProfileRecord() {
  return (
    <div className="pic-profile">
      <div className="pic-profile-head">
        <span className="pic-avatar pic-avatar-lg" aria-hidden="true">
          C
        </span>
        <div>
          <p className="pic-screen-title">{STORY_CREATOR.name}</p>
          <p className="pic-small">@{STORY_CREATOR.handle}, Creator account, Pune</p>
        </div>
      </div>
      <dl className="pic-stats">
        <div>
          <dt>Followers</dt>
          <dd className="pic-num">{formatCount(STORY_CREATOR.followers)}</dd>
        </div>
        <div>
          <dt>Engagement</dt>
          <dd className="pic-num">{formatPercent(STORY_CREATOR.engagement)}</dd>
        </div>
        <div>
          <dt>Completed deals</dt>
          <dd className="pic-num">{RECORD_DEALS.length}</dd>
        </div>
        <div>
          <dt>Total deal value</dt>
          <dd className="pic-num">{formatInr(RECORD_TOTAL_PAISE)}</dd>
        </div>
      </dl>
      <p className="pic-small pic-strong">Recent deals</p>
      <ul className="pic-record">
        {RECORD_DEALS.map((x) => (
          <li key={x.title}>
            <span className="pic-strong">{x.title}</span>
            <span className="pic-num">{formatInr(x.amountPaise)}</span>
            <span className="pic-small">
              With @{x.withHandle}, {x.date}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Sign-in: the Instagram account read back, to confirm before setting up. */
export function SignInScreen() {
  return (
    <div className="pic-feed">
      <p className="pic-screen-title">Is this you?</p>
      <div className="pic-deal">
        <div className="pic-deal-head">
          <span className="pic-avatar" aria-hidden="true">
            C
          </span>
          <div className="pic-deal-who">
            <p className="pic-deal-title">{STORY_CREATOR.name}</p>
            <p className="pic-small">@{STORY_CREATOR.handle}</p>
          </div>
        </div>
        <div className="pic-deal-foot">
          <span className="pic-chip">
            <Icon name="instagram" size={16} />
            Creator account
          </span>
          <span className="pic-mini-btn">This is me</span>
        </div>
      </div>
      <p className="pic-small">Followers and engagement come from Instagram.</p>
    </div>
  );
}

/** A posted deal: the brief's essentials and its breakdown, fixed at publish. */
export function PostedDeal() {
  const b = STORY_BREAKDOWN;
  return (
    <div className="pic-progress">
      <div className="pic-brand-head">
        <Monogram initials={STORY_DEAL.initials} tone={STORY_DEAL.tone} size={36} />
        <div>
          <p className="pic-screen-title">{STORY_DEAL.title}</p>
          <p className="pic-small">Apply by {STORY_DEAL.applyBy}. Content due 28 Nov.</p>
        </div>
        <span className="pic-chip pic-chip-ok">Open</span>
      </div>
      <ul className="pic-pays">
        <li>
          <span>Budget</span>
          <span className="pic-num">{formatInr(b.budgetPaise)}</span>
          <span className="pic-small">Fixed at publish</span>
        </li>
        <li>
          <span>ValueSkins fee</span>
          <span className="pic-num">{formatInr(b.commissionTotalPaise)}</span>
          <span className="pic-small">₹750.00 plus 18% GST</span>
        </li>
        <li className="is-done">
          <span>The creator gets</span>
          <span className="pic-num pic-lime">{formatInr(b.creatorAmountPaise)}</span>
          <span className="pic-small">30% before work, 70% after approval</span>
        </li>
      </ul>
    </div>
  );
}

/** The fee paid through Razorpay, and its GST tax invoice. */
export function FeeInvoice() {
  const b = STORY_BREAKDOWN;
  return (
    <div className="pic-progress">
      <div className="pic-brand-head">
        <Monogram initials={STORY_DEAL.initials} tone={STORY_DEAL.tone} size={36} />
        <div>
          <p className="pic-screen-title">ValueSkins fee</p>
          <p className="pic-small">Paid through Razorpay</p>
        </div>
        <span className="pic-chip pic-chip-ok">
          <Icon name="check" size={16} />
          Paid
        </span>
      </div>
      <ul className="pic-pays">
        <li>
          <span>Fee</span>
          <span className="pic-num">{formatInr(b.commissionBasePaise)}</span>
          <span className="pic-small">Flat, on every deal</span>
        </li>
        <li>
          <span>GST, 18%</span>
          <span className="pic-num">{formatInr(b.commissionGstPaise)}</span>
          <span className="pic-small">On the GST tax invoice</span>
        </li>
        <li className="is-done">
          <span>Total</span>
          <span className="pic-num">{formatInr(b.commissionTotalPaise)}</span>
          <span className="pic-small">The only money ValueSkins receives</span>
        </li>
      </ul>
    </div>
  );
}
