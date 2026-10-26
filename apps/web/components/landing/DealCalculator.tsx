'use client';

import { useId, useState, type FormEvent } from 'react';
import { formatInr } from '@valueskins/shared';
import { groupRupees } from '@/lib/draftStore';
import { cleanDigits, quote } from './amount';
import { useCountUp } from './motion';

function Line({
  label,
  paise,
  of,
  tone,
  strong = false,
}: {
  label: string;
  paise: number;
  /** The deal amount: the bar under the line shows this part of it. */
  of: number;
  tone: 'fee' | 'advance' | 'final' | 'total';
  strong?: boolean;
}) {
  const shown = useCountUp(paise, 500);
  const share = of > 0 ? Math.min(1, paise / of) : 0;
  return (
    <li className={strong ? 'v3-calc-line is-strong' : 'v3-calc-line'}>
      <span>{label}</span>
      <span className="v3-num">{formatInr(shown)}</span>
      <span className={`v3-calc-bar v3-calc-bar-${tone}`} aria-hidden="true">
        <span style={{ transform: `scaleX(${share})` }} />
      </span>
    </li>
  );
}

/**
 * The live thing: type a deal amount and see the fee, what the creator receives and the two UPI
 * payments, worked out by computeBreakdown as a published deal is. The figures count to their new
 * values and each bar shows its share of the deal. It is a real GET form, so without script the
 * server works it out from `?amount=`.
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
    <form method="get" action="/" onSubmit={submit} className="v3-calc">
      <label htmlFor={`${id}-amount`} className="v3-calc-label">
        Deal amount in rupees
      </label>
      <div className="v3-calc-row">
        <div className="v3-calc-input">
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
        <button type="submit" className="v3-btn v3-calc-submit">
          Work it out
        </button>
      </div>
      <p id={`${id}-help`} className="v3-small">
        Whole rupees, {formatInr(q.kind === 'below' ? q.minPaise : minPaise)} or more.
      </p>
      <p className="sr-only" role="status" aria-atomic="true">
        {status}
      </p>
      {q.kind === 'ok' ? (
        <ul className="v3-calc-lines" aria-label="Your deal">
          <Line
            label={`ValueSkins fee, ${gstRateBps / 100}% GST included`}
            paise={q.breakdown.commissionTotalPaise}
            of={q.breakdown.budgetPaise}
            tone="fee"
          />
          <Line
            label="30% by UPI, before work starts"
            paise={q.breakdown.advancePaise}
            of={q.breakdown.budgetPaise}
            tone="advance"
          />
          <Line
            label="70% by UPI, after approval"
            paise={q.breakdown.finalPaise}
            of={q.breakdown.budgetPaise}
            tone="final"
          />
          <Line
            label="The creator receives"
            paise={q.breakdown.creatorAmountPaise}
            of={q.breakdown.budgetPaise}
            tone="total"
            strong
          />
        </ul>
      ) : (
        <div className="v3-calc-lines" aria-label="Your deal" role="group">
          {q.kind === 'below' ? (
            <p className="v3-calc-fee">
              ValueSkins fee, every deal{' '}
              <span className="v3-num">{formatInr(q.fee.commissionTotalPaise)}</span>
            </p>
          ) : null}
          <p className="v3-strong">{status}</p>
        </div>
      )}
    </form>
  );
}
