'use client';

import { useRef, useState } from 'react';
import { useInView } from './motion';

const RULES = [
  'The amount is final',
  'No chat',
  'No negotiation',
  'Paid directly by UPI',
  '30% before work',
  '70% after approval',
  'Public accounts only',
  'On both profiles',
];

function Rules({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className="hm-rules-list" aria-hidden={hidden || undefined}>
      {RULES.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  );
}

/**
 * The deal rules at a glance, as one slow band. It runs only on screen, pauses on hover, on focus
 * and with its own button, and stands still under reduced motion. The second copy, there only to
 * close the loop, is hidden from assistive technology.
 */
export function RulesStrip() {
  const band = useRef<HTMLDivElement>(null);
  const inView = useInView(band);
  const [paused, setPaused] = useState(false);
  return (
    <section className="hm-rules" aria-labelledby="rules-title">
      <h2 id="rules-title" className="sr-only">
        The rules of every deal
      </h2>
      <div className="hm-rules-band" ref={band} data-paused={!inView || paused || undefined}>
        <div className="hm-rules-track">
          <Rules />
          <Rules hidden />
        </div>
      </div>
      <div className="hm-wrap hm-rules-foot">
        <button
          type="button"
          className="hm-pause"
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? 'Play' : 'Pause'}
        </button>
      </div>
    </section>
  );
}
