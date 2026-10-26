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
      className={`v3-mono v3-tone-${tone}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function ExamplePill() {
  return <span className="v3-example">Example</span>;
}

/** A phone with one app screen inside. */
export function Phone({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="v3-phone" role="img" aria-label={label}>
      <div className="v3-phone-screen" inert>
        <div className="v3-app-bar">
          <span className="v3-app-mark">ValueSkins</span>
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
    <div className="v3-panel" role="img" aria-label={label}>
      <div className="v3-panel-bar" aria-hidden="true">
        <span className="v3-dot" />
        <span className="v3-dot" />
        <span className="v3-dot" />
        <p>{title}</p>
        <ExamplePill />
      </div>
      <div className="v3-panel-body" inert>
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
    <div className={fresh ? 'v3-deal is-fresh' : 'v3-deal'}>
      <div className="v3-deal-head">
        <Monogram initials={deal.initials} tone={deal.tone} size={30} />
        <div className="v3-deal-who">
          <p className="v3-deal-title">{deal.title}</p>
          <p className="v3-small">@{deal.handle}</p>
        </div>
      </div>
      <div className="v3-deal-foot">
        <div>
          <p className="v3-num">{formatInr(deal.amountPaise)}</p>
          <p className="v3-small">Apply by {deal.applyBy}</p>
        </div>
        {state === 'applied' ? (
          <span className="v3-chip v3-chip-ok">
            <Icon name="check" size={16} />
            Applied
          </span>
        ) : (
          <span className={state === 'pressed' ? 'v3-mini-btn is-pressed' : 'v3-mini-btn'}>
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
    <div className="v3-feed">
      <p className="v3-screen-title">Open deals</p>
      <div className="v3-feed-view">
        <div
          ref={list}
          className={showNew ? 'v3-feed-list has-new' : 'v3-feed-list'}
          style={
            slot ? ({ ['--v3-slot' as string]: `${slot}px` } as React.CSSProperties) : undefined
          }
        >
          <div className="v3-feed-new" ref={fresh}>
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

/** "30% received": the creator confirms the brand's UPI payment arrived. */
export function ReceivedCard({ shown }: { shown: boolean }) {
  const amount = useCountUp(shown ? STORY_BREAKDOWN.advancePaise : 0, 1100, 0);
  return (
    <div className={shown ? 'v3-received is-shown' : 'v3-received'}>
      <span className="v3-received-icon">
        <Icon name="checkCircle" size={20} />
      </span>
      <div>
        <p className="v3-received-title">30% received</p>
        <p className="v3-received-amount v3-num">{formatInr(amount)}</p>
        <p className="v3-small">By UPI from @{STORY_DEAL.handle}. Confirmed by you.</p>
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
  const cls = ['v3-applicant', fresh && 'is-fresh', shown && 'is-shown', picked && 'is-picked']
    .filter(Boolean)
    .join(' ');
  return (
    <li className={cls}>
      <span className="v3-avatar" aria-hidden="true">
        {a.name.split(' ')[1]?.[0] ?? a.name[0]}
      </span>
      <div className="v3-applicant-who">
        <p className="v3-strong">@{a.handle}</p>
        <p className="v3-small">{a.name}</p>
      </div>
      <p className="v3-num v3-col">{formatCount(a.followers)}</p>
      <p className="v3-num v3-col">{formatPercent(a.engagement)}</p>
      {picked ? (
        <span className="v3-chip v3-chip-ok">
          <Icon name="check" size={16} />
          Picked
        </span>
      ) : (
        <span className="v3-mini-btn v3-mini-btn-quiet">Pick</span>
      )}
    </li>
  );
}

/** The brand's deal page: the posted deal and who applied. */
export function BrandApplicants({ showNew, picked }: { showNew: boolean; picked: boolean }) {
  return (
    <div className="v3-brand">
      <div className="v3-brand-head">
        <Monogram initials={STORY_DEAL.initials} tone={STORY_DEAL.tone} size={40} />
        <div>
          <p className="v3-screen-title">{STORY_DEAL.title}</p>
          <p className="v3-small">
            {formatInr(STORY_DEAL.amountPaise)}, apply by {STORY_DEAL.applyBy}
          </p>
        </div>
        <span className={picked ? 'v3-chip v3-chip-ok' : 'v3-chip'}>
          {picked ? 'Creator confirmed' : 'Open'}
        </span>
      </div>
      <div className="v3-table-head" aria-hidden="true">
        <span>Applicant</span>
        <span className="v3-col">Followers</span>
        <span className="v3-col">Engagement</span>
        <span />
      </div>
      <ul className="v3-applicants">
        <ApplicantRow a={STORY_CREATOR} fresh shown={showNew} picked={picked} />
        {OTHER_APPLICANTS.map((a) => (
          <ApplicantRow key={a.handle} a={a} />
        ))}
      </ul>
    </div>
  );
}

const STATUS = {
  applied: { text: 'Applied', cls: 'v3-chip' },
  picked: { text: 'Picked', cls: 'v3-chip v3-chip-ok' },
  other: { text: 'Not selected', cls: 'v3-chip v3-chip-quiet' },
} as const;

/** The creator's Applications, with the status of each. */
export function CreatorApplications({ picked }: { picked: boolean }) {
  const rows: Array<{ deal: ExampleDeal; status: keyof typeof STATUS }> = [
    { deal: STORY_DEAL, status: picked ? 'picked' : 'applied' },
    { deal: FEED_DEALS[0]!, status: 'applied' },
    { deal: FEED_DEALS[1]!, status: 'other' },
  ];
  return (
    <div className="v3-apps">
      <p className="v3-screen-title">Your applications</p>
      <ul>
        {rows.map(({ deal, status }) => (
          <li key={deal.title} className="v3-app-row">
            <Monogram initials={deal.initials} tone={deal.tone} size={30} />
            <div className="v3-app-who">
              <p className="v3-strong">{deal.title}</p>
              <p className="v3-small">
                You receive {formatInr(computeBreakdown(deal.amountPaise).creatorAmountPaise)}
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
    <div className="v3-progress">
      <div className="v3-brand-head">
        <Monogram initials={STORY_DEAL.initials} tone={STORY_DEAL.tone} size={36} />
        <div>
          <p className="v3-screen-title">{STORY_DEAL.title}</p>
          <p className="v3-small">
            @{STORY_DEAL.handle} and @{STORY_CREATOR.handle}
          </p>
        </div>
        <span className={reached >= 9 ? 'v3-chip v3-chip-ok' : 'v3-chip'}>
          {STEP_LABELS[Math.max(0, Math.min(reached, 9) - 1)]}
        </span>
      </div>
      <ol className="v3-steps" aria-label="Deal steps">
        {STEP_LABELS.map((label, i) => (
          <li key={label} className={i < reached ? 'is-done' : undefined}>
            <span className="v3-step-dot" aria-hidden="true" />
            <span className="v3-step-label">{label}</span>
          </li>
        ))}
      </ol>
      {/* On narrow screens the nine labels do not fit under the bar: only the current one shows. */}
      <p className="v3-step-now">
        Step {Math.max(1, Math.min(reached, STEP_LABELS.length))} of {STEP_LABELS.length}:{' '}
        <span className="v3-strong">{STEP_LABELS[Math.max(0, Math.min(reached, 9) - 1)]}</span>
      </p>
      <ul className="v3-pays">
        <li className={advanceDone ? 'is-done' : undefined}>
          <span>30% by UPI, before work</span>
          <span className="v3-num">{formatInr(b.advancePaise)}</span>
          <span className="v3-small">
            {advanceDone ? 'Confirmed by the creator' : 'Not paid yet'}
          </span>
        </li>
        <li className={finalDone ? 'is-done' : undefined}>
          <span>70% by UPI, after approval</span>
          <span className="v3-num">{formatInr(b.finalPaise)}</span>
          <span className="v3-small">
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
    <div className="v3-profile">
      <div className="v3-profile-head">
        <span className="v3-avatar v3-avatar-lg" aria-hidden="true">
          C
        </span>
        <div>
          <p className="v3-screen-title">{STORY_CREATOR.name}</p>
          <p className="v3-small">@{STORY_CREATOR.handle}, Creator account, Pune</p>
        </div>
      </div>
      <dl className="v3-stats">
        <div>
          <dt>Followers</dt>
          <dd className="v3-num">{formatCount(STORY_CREATOR.followers)}</dd>
        </div>
        <div>
          <dt>Engagement</dt>
          <dd className="v3-num">{formatPercent(STORY_CREATOR.engagement)}</dd>
        </div>
        <div>
          <dt>Completed deals</dt>
          <dd className="v3-num">{RECORD_DEALS.length}</dd>
        </div>
        <div>
          <dt>Total deal value</dt>
          <dd className="v3-num">{formatInr(RECORD_TOTAL_PAISE)}</dd>
        </div>
      </dl>
      <p className="v3-small v3-strong">Recent deals</p>
      <ul className="v3-record">
        {RECORD_DEALS.map((x) => (
          <li key={x.title}>
            <span className="v3-strong">{x.title}</span>
            <span className="v3-num">{formatInr(x.amountPaise)}</span>
            <span className="v3-small">
              With @{x.withHandle}, {x.date}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
