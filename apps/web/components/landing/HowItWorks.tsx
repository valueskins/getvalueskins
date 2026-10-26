'use client';

import { useEffect, useRef, useState } from 'react';
import { formatInr, STEP_LABELS } from '@valueskins/shared';
import { nth, prefersReducedMotion } from './motion';
import { STORY_BREAKDOWN } from './screens/data';
import { DealProgress, Panel } from './screens/Screens';

const fee = formatInr(STORY_BREAKDOWN.commissionTotalPaise);

/** Each step, and how far along the nine-step bar the example deal is once you reach it. */
const STEPS = [
  {
    title: 'Post a deal',
    text: 'The brand says what it needs, the deadline and the amount. The amount is final: no chat, no negotiation.',
    reached: 1,
  },
  {
    title: 'Apply and pick',
    text: `Every creator sees the deal and can apply for free. The brand opens their profiles, picks one and pays ValueSkins ${fee} through Razorpay, with a GST tax invoice.`,
    reached: 3,
  },
  {
    title: 'Get paid by UPI',
    text: 'The brand pays the creator 30% by UPI before work starts. The content comes as a Google Drive link; the brand approves it or asks for changes, then pays the 70%. The creator confirms each payment.',
    reached: 8,
  },
  {
    title: 'The deal record',
    text: 'Both download the deal record, and the deal is added to both profiles.',
    reached: STEP_LABELS.length,
  },
];

/**
 * How it works: four steps beside the example deal. As the section scrolls past, the nine-step bar
 * fills and the deal moves to the state each step describes. Without script or under reduced motion
 * the deal shows as completed and the bar is full.
 */
export function HowItWorks() {
  const section = useRef<HTMLElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(STEPS.length - 1);

  useEffect(() => {
    const el = section.current;
    if (!el || prefersReducedMotion()) return;
    setActive(0);
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const span = r.height - innerHeight * 0.5;
        const p = Math.max(0, Math.min(1, (innerHeight * 0.5 - r.top) / Math.max(1, span)));
        fill.current?.style.setProperty('transform', `scaleX(${p.toFixed(4)})`);
        setActive(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length)));
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section id="how" className="v3-how" ref={section} aria-labelledby="how-title">
      <div className="v3-how-head">
        <p className="v3-pill" data-rise>
          How it works
        </p>
        <h2 id="how-title" className="v3-h2" data-rise style={nth(1)}>
          From posted to <em>paid</em>, in four steps
        </h2>
      </div>
      <div className="v3-how-grid">
        <ol className="v3-how-steps">
          {STEPS.map((s, i) => (
            // The active step is a data attribute: the entrance adds a class of its own, and a
            // re-rendered className would wipe it.
            <li key={s.title} data-active={i === active || undefined} data-rise>
              <span className="v3-how-n" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3 className="v3-h3">{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="v3-how-show">
          <div className="v3-how-sticky">
            <div className="v3-bar" aria-hidden="true">
              <span className="v3-bar-fill" ref={fill} />
            </div>
            <Panel
              title="Deal in progress"
              label={`Example deal, at: ${STEP_LABELS[STEPS[active]!.reached - 1]}.`}
            >
              <DealProgress reached={STEPS[active]!.reached} />
            </Panel>
            {/* The panel is a picture; the nine steps are listed here for assistive technology. */}
            <ol className="sr-only" aria-label="The nine steps of a deal">
              {STEP_LABELS.map((label, i) => {
                const reached = STEPS[active]!.reached;
                const state =
                  i < reached - 1 ? ', done' : i === reached - 1 ? ', current step' : '';
                return <li key={label}>{`${label}${state}`}</li>;
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
