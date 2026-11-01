'use client';

import { useId, useState, type FormEvent } from 'react';
import { formatInr, type MoneyBreakdown } from '@valueskins/shared';
import { groupRupees } from '@/lib/draftStore';
import { cleanDigits, quote } from './amount';
import { useCountUp } from './motion';

type Tone = 'fee' | 'advance' | 'final' | 'total';

function Figure({ label, paise, tone }: { label: string; paise: number; tone: Tone }) {
  const shown = useCountUp(paise, 500);
  return (
    <li className={`hm-figure hm-figure-${tone}`}>
      <span>{label}</span>
      <span className="hm-num">{formatInr(shown)}</span>
    </li>
  );
}

/**
 * The deal amount as one bar, cut into the fee and the two UPI payments. Each part is a full-width
 * layer moved and scaled into place, so a new amount animates with transforms only.
 */
function SplitBar({ b }: { b: MoneyBreakdown }) {
  const total = b.budgetPaise;
  const fee = b.commissionTotalPaise / total;
  const advance = b.advancePaise / total;
  const final = b.finalPaise / total;
  const parts: Array<[Tone, number, number]> = [
    ['fee', 0, fee],
    ['advance', fee, advance],
    ['final', fee + advance, final],
  ];
  return (
    <div className="hm-calc-bar" aria-hidden="true">
      {parts.map(([tone, at, size]) => (
        <span
          key={tone}
          className={`hm-calc-seg hm-calc-seg-${tone}`}
          style={{ transform: `translateX(${(at * 100).toFixed(3)}%) scaleX(${size.toFixed(5)})` }}
        />
      ))}
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
        <div className="hm-calc-input">
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
        Whole rupees, {formatInr(q.kind === 'below' ? q.minPaise : minPaise)} or more.
      </p>
      <p className="sr-only" role="status" aria-atomic="true">
        {status}
      </p>
      {q.kind === 'ok' ? (
        <div className="hm-calc-out">
          <SplitBar b={q.breakdown} />
          <ul className="hm-figures" aria-label="Your deal">
            <Figure
              label={`ValueSkins fee, ${gstRateBps / 100}% GST included`}
              paise={q.breakdown.commissionTotalPaise}
              tone="fee"
            />
            <Figure
              label="30% by UPI, before work starts"
              paise={q.breakdown.advancePaise}
              tone="advance"
            />
            <Figure
              label="70% by UPI, after approval"
              paise={q.breakdown.finalPaise}
              tone="final"
            />
            <Figure
              label="The creator receives"
              paise={q.breakdown.creatorAmountPaise}
              tone="total"
            />
          </ul>
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
