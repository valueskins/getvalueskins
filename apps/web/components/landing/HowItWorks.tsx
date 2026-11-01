'use client';

import { useEffect, useRef, useState } from 'react';
import { formatInr, STEP_LABELS } from '@valueskins/shared';
import { STORY_BREAKDOWN } from './screens/data';

const fee = formatInr(STORY_BREAKDOWN.commissionTotalPaise);

/** Each step, and how far along the nine deal steps the example deal is once you reach it. */
const STEPS = [
  {
    title: 'Post the deal',
    text: 'The brand says what it needs, the deadline and the amount. The amount is final: no chat, no negotiation.',
    reached: 1,
  },
  {
    title: 'Apply for free',
    text: 'Every creator sees every open deal and can apply for free.',
    reached: 1,
  },
  {
    title: 'Pick one creator',
    text: `The brand opens the applicants' profiles and picks one, then pays ValueSkins ${fee} through Razorpay, with a GST invoice.`,
    reached: 3,
  },
  {
    title: 'Pay 30% by UPI',
    text: 'Before work starts, the brand pays the creator 30% directly by UPI. The creator confirms it.',
    reached: 4,
  },
  {
    title: 'Share the content',
    text: 'The creator shares the content as a Google Drive link. The brand approves it or asks for changes.',
    reached: 7,
  },
  {
    title: 'Pay 70% by UPI',
    text: 'After approval, the brand pays the other 70% by UPI. The creator confirms it.',
    reached: 8,
  },
  {
    title: 'Keep the record',
    text: 'Both download the deal record, and the deal goes on both profiles.',
    reached: STEP_LABELS.length,
  },
];

/** What the creator has been paid by UPI once the deal reaches a step. */
function paidSoFar(reached: number): number {
  if (reached >= 8) return STORY_BREAKDOWN.creatorAmountPaise;
  if (reached >= 4) return STORY_BREAKDOWN.advancePaise;
  return 0;
}

/**
 * How it works: the steps scroll past while the example deal stays in view beside them and moves
 * to the state each step describes. Each step reports itself as it crosses the middle of the
 * screen. Without script the deal shows as completed.
 */
export function HowItWorks() {
  const list = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(STEPS.length - 1);

  useEffect(() => {
    const el = list.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const items = [...el.querySelectorAll<HTMLElement>('[data-step]')];
    // With script, the deal starts at the first step and follows the reader down.
    setActive(0);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    items.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  const reached = STEPS[active]!.reached;
  const label = STEP_LABELS[reached - 1]!;
  return (
    <section id="how" className="hm-how" aria-labelledby="how-title">
      <div className="hm-wrap hm-how-grid">
        <div className="hm-how-aside">
          <h2 id="how-title" className="hm-h2" data-rise>
            From posted to paid.
          </h2>
          <div className="hm-how-now" aria-hidden="true">
            <p className="hm-how-count hm-num">
              Step {reached} of {STEP_LABELS.length}
            </p>
            <p key={label} className="hm-how-label">
              {label}
            </p>
            <ol className="hm-rail">
              {STEP_LABELS.map((l, i) => (
                <li key={l} data-done={i < reached || undefined} />
              ))}
            </ol>
            <dl className="hm-how-money">
              <div>
                <dt>Fee to ValueSkins</dt>
                <dd className="hm-num">{reached >= 3 ? fee : 'Not yet'}</dd>
              </div>
              <div>
                <dt>Paid to the creator by UPI</dt>
                <dd className="hm-num">{formatInr(paidSoFar(reached))}</dd>
              </div>
            </dl>
          </div>
          <p className="hm-step-now hm-num" aria-hidden="true">
            Step {reached} of {STEP_LABELS.length}: {label}
          </p>
          {/* The panel is a picture; the nine steps are listed here for assistive technology. */}
          <ol className="sr-only" aria-label="The nine steps of a deal">
            {STEP_LABELS.map((l, i) => {
              const state = i < reached - 1 ? ', done' : i === reached - 1 ? ', current step' : '';
              return <li key={l}>{`${l}${state}`}</li>;
            })}
          </ol>
        </div>
        <ol className="hm-how-steps" ref={list}>
          {STEPS.map((s, i) => (
            <li key={s.title} data-step={i} data-active={i === active || undefined}>
              <h3 className="hm-h3">{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
