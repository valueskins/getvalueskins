import { formatInr } from '@valueskins/shared';
import { Icon } from '@/components/ui/Icon';
import { formatCount, formatPercent } from '@/lib/format';
import { STORY_BREAKDOWN, STORY_CREATOR, STORY_DEAL } from './screens/data';

/** One beat of the example deal's life, from posted (0) to completed (6). */
export type Beat = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const LAST_BEAT: Beat = 6;

const STATUS: Record<Beat, string> = {
  0: `Open. Apply by ${STORY_DEAL.applyBy}.`,
  1: 'Creators are applying.',
  2: `@${STORY_CREATOR.handle} picked. Fee paid.`,
  3: '30% paid by UPI. Confirmed.',
  4: 'Content shared as a Google Drive link.',
  5: 'Approved. 70% paid by UPI. Confirmed.',
  6: 'Completed. On both profiles.',
};

function Mono({ initials, tone }: { initials: string; tone: 'brand' | 'creator' }) {
  return (
    <span className={`hm-mono hm-mono-${tone}`} aria-hidden="true">
      {initials}
    </span>
  );
}

/** The three parts of the deal amount, each filling in once it is paid. */
function Split({ beat }: { beat: Beat }) {
  const b = STORY_BREAKDOWN;
  const parts = [
    { key: 'fee', label: 'Fee', paise: b.commissionTotalPaise, paid: beat >= 2 },
    { key: 'advance', label: '30% by UPI', paise: b.advancePaise, paid: beat >= 3 },
    { key: 'final', label: '70% by UPI', paise: b.finalPaise, paid: beat >= 5 },
  ];
  return (
    <div className="hm-split">
      <div className="hm-split-bar">
        {parts.map((p) => (
          <span
            key={p.key}
            className={`hm-split-seg hm-split-${p.key}`}
            data-paid={p.paid || undefined}
            style={{ flexGrow: p.paise }}
          />
        ))}
      </div>
      <dl className="hm-split-legend">
        {parts.map((p) => (
          <div key={p.key} data-paid={p.paid || undefined}>
            <dt>{p.label}</dt>
            <dd className="hm-num">{formatInr(p.paise)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The hero's picture: the example deal as a ticket, with the creator who applied, the UPI payment
 * and the finished record floating around it. It is a picture with made-up data, so it is inert and
 * labelled as an example; `beat` says how far along the deal is.
 */
export function DealTicket({ beat }: { beat: Beat }) {
  const finalPaid = beat >= 5;
  return (
    <div
      className="hm-stage"
      role="img"
      aria-label="Example: a brand's deal moving from posted to completed, with the creator paid by UPI."
      data-beat={beat}
    >
      <div className="hm-stage-in" inert>
        <div className="hm-panel" aria-hidden="true" />
        <div className="hm-ticket hm-depth-1">
          <div className="hm-ticket-main">
            <div className="hm-ticket-top">
              <Mono initials={STORY_DEAL.initials} tone="brand" />
              <div className="hm-ticket-who">
                <p className="hm-strong">{STORY_DEAL.brand}</p>
                <p className="hm-small">@{STORY_DEAL.handle}</p>
              </div>
              <span className="hm-example">Example</span>
            </div>
            <p className="hm-ticket-title">{STORY_DEAL.title}</p>
            <div className="hm-ticket-amount">
              <span className="hm-num">{formatInr(STORY_DEAL.amountPaise)}</span>
              <span className="hm-lock">
                <Icon name="lock" size={16} />
                Final amount
              </span>
            </div>
          </div>
          <div className="hm-perf" aria-hidden="true" />
          <div className="hm-ticket-foot">
            <Split beat={beat} />
            <p className="hm-ticket-status">
              <span key={beat} className="hm-status-line">
                {beat === LAST_BEAT ? <Icon name="checkCircle" size={16} /> : null}
                {STATUS[beat]}
              </span>
            </p>
          </div>
        </div>

        <div className="hm-sat hm-sat-creator hm-depth-2" data-on={beat >= 1 || undefined}>
          <Mono initials="EC" tone="creator" />
          <div>
            <p className="hm-strong">@{STORY_CREATOR.handle}</p>
            <p className="hm-small">
              {formatCount(STORY_CREATOR.followers)} followers,{' '}
              {formatPercent(STORY_CREATOR.engagement)}
            </p>
          </div>
          <span className="hm-tag" data-on={beat >= 2 || undefined}>
            {beat >= 2 ? 'Picked' : 'Applied'}
          </span>
        </div>

        <div className="hm-sat hm-sat-upi hm-depth-3" data-on={beat >= 3 || undefined}>
          <p className="hm-small">{finalPaid ? '70% received by UPI' : '30% received by UPI'}</p>
          <p className="hm-sat-amount hm-num" data-final={finalPaid || undefined}>
            {formatInr(finalPaid ? STORY_BREAKDOWN.finalPaise : STORY_BREAKDOWN.advancePaise)}
          </p>
          <p className="hm-confirmed">
            <Icon name="check" size={16} />
            Confirmed by the creator
          </p>
        </div>

        <div className="hm-sat hm-sat-record hm-depth-2" data-on={beat >= 6 || undefined}>
          <Icon name="checkCircle" size={20} />
          <div>
            <p className="hm-strong">Deal record ready</p>
            <p className="hm-small">Added to both profiles</p>
          </div>
        </div>
      </div>
    </div>
  );
}
