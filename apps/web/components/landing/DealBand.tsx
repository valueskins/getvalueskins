'use client';

import { useRef, useState } from 'react';
import { formatInr } from '@valueskins/shared';
import { useInView } from './motion';
import { EXAMPLE_DEALS, type ExampleDeal } from './screens/data';
import { ExamplePill, Monogram } from './screens/Screens';

function BandCard({ deal }: { deal: ExampleDeal }) {
  return (
    <li className="v3-band-card">
      <Monogram initials={deal.initials} tone={deal.tone} size={40} />
      <div className="v3-band-who">
        <p className="v3-strong">{deal.title}</p>
        <p className="v3-small">
          @{deal.handle}, apply by {deal.applyBy}
        </p>
      </div>
      <p className="v3-band-amount v3-num">{formatInr(deal.amountPaise)}</p>
      <ExamplePill />
    </li>
  );
}

/**
 * A slow band of example open deals. It pauses on hover, on focus, off screen and with its own
 * button, and stands still under reduced motion. The second copy, there only to close the loop,
 * is hidden from assistive technology.
 */
export function DealBand() {
  const band = useRef<HTMLDivElement>(null);
  const inView = useInView(band);
  const [paused, setPaused] = useState(false);
  const cls = ['v3-band', (!inView || paused) && 'is-paused'].filter(Boolean).join(' ');
  return (
    <section className="v3-band-section" aria-labelledby="band-title">
      <div className="v3-band-head">
        <h2 id="band-title" className="v3-band-title">
          Open deals look like this
        </h2>
        <button
          type="button"
          className="v3-pause v3-pause-band"
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? 'Play' : 'Pause'}
        </button>
      </div>
      <div className={cls} ref={band}>
        <div className="v3-band-track">
          <ul className="v3-band-list">
            {EXAMPLE_DEALS.map((deal) => (
              <BandCard key={deal.title} deal={deal} />
            ))}
          </ul>
          <ul className="v3-band-list" aria-hidden="true">
            {EXAMPLE_DEALS.map((deal) => (
              <BandCard key={deal.title} deal={deal} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
