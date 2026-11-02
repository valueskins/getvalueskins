'use client';

import { useId, useState, type CSSProperties, type FormEvent } from 'react';
import { formatInr, type MoneyBreakdown } from '@valueskins/shared';
import { groupRupees } from '@/lib/draftStore';
import { amountHint, cleanDigits, fieldEm, figureEm, quote } from './amount';
import { useCountUp } from './motion';

const COUNT_MS = 500;

/**
 * The four figures. Each tile sizes its amount to its own width from --num-em, the width in em of
 * the longest amount shown or on its way, so a figure never outgrows its tile, even mid-count; the
 * row of four becomes two by two, or one, before an amount would drop under 18px (home.css).
 */
function Figures({ b }: { b: MoneyBreakdown }) {
  const tiles = [
    { tone: 'fee', label: 'Fee, GST included', paise: b.commissionTotalPaise },
    { tone: 'advance', label: '30% by UPI, before work', paise: b.advancePaise },
    { tone: 'final', label: '70% by UPI, after approval', paise: b.finalPaise },
    { tone: 'total', label: 'The creator receives', paise: b.creatorAmountPaise },
  ];
  const shown = [
    useCountUp(tiles[0]!.paise, COUNT_MS),
    useCountUp(tiles[1]!.paise, COUNT_MS),
    useCountUp(tiles[2]!.paise, COUNT_MS),
    useCountUp(tiles[3]!.paise, COUNT_MS),
  ];
  const numEm = Math.max(
    ...[...shown, ...tiles.map((t) => t.paise)].map((p) => figureEm(formatInr(p))),
  );
  return (
    <ul
      className="hm-figures"
      aria-label="Your deal"
      style={{ '--num-em': numEm } as CSSProperties}
    >
      {tiles.map((t, i) => (
        <li key={t.tone} className={`hm-figure hm-figure-${t.tone}`}>
          <span>{t.label}</span>
          <span className="hm-num">{formatInr(shown[i]!)}</span>
        </li>
      ))}
    </ul>
  );
}

/** One part of the bar, as a percentage of the deal amount. */
function share(paise: number, b: MoneyBreakdown): string {
  return `${((paise / b.budgetPaise) * 100).toFixed(3)}%`;
}

/**
 * The deal amount as one bar, cut into the fee and the two UPI payments. Each part is a layer from
 * where it starts to the end of the bar, under the next one, moved into place with a transform, so
 * a new amount animates with transforms only. The fee keeps a minimum width (home.css), so it shows
 * on the largest deal, and the 70% gives up that width so the bar stays full.
 */
function SplitBar({ b }: { b: MoneyBreakdown }) {
  const style = {
    '--fee': share(b.commissionTotalPaise, b),
    '--advance': share(b.advancePaise, b),
  } as CSSProperties;
  return (
    <div className="hm-calc-bar" aria-hidden="true" style={style}>
      <span className="hm-calc-seg hm-calc-seg-fee" />
      <span className="hm-calc-seg hm-calc-seg-advance" />
      <span className="hm-calc-seg hm-calc-seg-final" />
    </div>
  );
}

/**
 * The live thing: type a deal amount and see the fee, the two UPI payments and what the creator
 * receives, worked out by computeBreakdown as a published deal is. The figures count to their new
 * values and the bar re-cuts itself. It is a real GET form, so without script the server works it
 * out from `?amount=`.
 */
export function DealCalculator({
  initialDigits,
  minPaise,
  gstRateBps,
}: {
  initialDigits: string;
  minPaise: number;
  gstRateBps: number;
}) {
  const [digits, setDigits] = useState(initialDigits);
  const id = useId();
  const q = quote(digits, minPaise, gstRateBps);

  function change(typed: string) {
    const next = cleanDigits(typed);
    setDigits(next);
    // Keep the address in step, so a worked-out amount can be shared.
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('amount', next);
    else url.searchParams.delete('amount');
    window.history.replaceState(window.history.state, '', url);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  const status =
    q.kind === 'ok'
      ? `On a ${formatInr(q.breakdown.budgetPaise)} deal, the creator receives ${formatInr(q.breakdown.creatorAmountPaise)}.`
      : q.kind === 'below'
        ? `Enter ${formatInr(q.minPaise)} or more.`
        : 'Enter a deal amount.';

  return (
    <form method="get" action="/" onSubmit={submit} className="hm-calc">
      <label htmlFor={`${id}-amount`} className="hm-calc-label">
        Deal amount in rupees
      </label>
      <div className="hm-calc-row">
        <div
          className="hm-calc-input"
          data-affix
          style={{ '--field-em': fieldEm(groupRupees(digits)) } as CSSProperties}
        >
          <span aria-hidden="true">₹</span>
          <input
            id={`${id}-amount`}
            name="amount"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            value={groupRupees(digits)}
            onChange={(e) => change(e.target.value)}
            aria-describedby={`${id}-help`}
          />
        </div>
        <button type="submit" className="hm-btn hm-calc-submit">
          Work it out
        </button>
      </div>
      <p id={`${id}-help`} className="hm-calc-help">
        {amountHint(minPaise)}
      </p>
      <p className="sr-only" role="status" aria-atomic="true">
        {status}
      </p>
      {q.kind === 'ok' ? (
        <div className="hm-calc-out">
          <SplitBar b={q.breakdown} />
          <Figures b={q.breakdown} />
        </div>
      ) : (
        <div className="hm-calc-out hm-calc-empty" aria-label="Your deal" role="group">
          {q.kind === 'below' ? (
            <p className="hm-calc-fee">
              ValueSkins fee, every deal{' '}
              <span className="hm-num">{formatInr(q.fee.commissionTotalPaise)}</span>
            </p>
          ) : null}
          <p className="hm-strong">{status}</p>
        </div>
      )}
    </form>
  );
}
