'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { nth, useInView, useReducedMotion } from './motion';
import { BrandApplicants, CreatorApplications, Panel, Phone } from './screens/Screens';

/** Flips between two states every few seconds while on screen; rests on `rest` otherwise. */
function useToggle(ref: React.RefObject<HTMLElement | null>, every: number, rest: boolean) {
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const [on, setOn] = useState(rest);
  useEffect(() => {
    if (reduced || !inView) {
      setOn(rest);
      return;
    }
    setOn(!rest);
    const t = setInterval(() => setOn((v) => !v), every);
    return () => clearInterval(t);
  }, [reduced, inView, every, rest]);
  return on;
}

function Points({ items }: { items: string[] }) {
  return (
    <ul className="v3-points">
      {items.map((t, i) => (
        <li key={t} data-rise style={nth(i + 2)}>
          <span className="v3-tick" aria-hidden="true">
            <Icon name="check" size={16} />
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

/** For brands and for creators: what each side does and gets, each with its own live screen. */
export function Sides() {
  const brandShow = useRef<HTMLDivElement>(null);
  const creatorShow = useRef<HTMLDivElement>(null);
  const picked = useToggle(brandShow, 3200, true);
  const confirmed = useToggle(creatorShow, 3600, true);
  return (
    <>
      <section id="brands" className="v3-side" aria-labelledby="brands-title">
        <div className="v3-side-copy">
          <p className="v3-pill" data-rise>
            For brands
          </p>
          <h2 id="brands-title" className="v3-h2" data-rise style={nth(1)}>
            Post once. <em>Pick</em> from who applies.
          </h2>
          <Points
            items={[
              'Post what you need, the deadline and the amount. The amount is final.',
              'Every creator sees your deal and can apply.',
              "Open each applicant's profile: followers, engagement and the deals they finished.",
              'Pick one. Pay the creator 30% by UPI before work and 70% after you approve.',
            ]}
          />
        </div>
        <div className="v3-side-show" ref={brandShow} data-rise style={nth(1)}>
          <div className="v3-glow v3-glow-soft" aria-hidden="true" />
          <Panel title="Your deal" label="Example: a brand picks one creator from the applicants.">
            <BrandApplicants showNew picked={picked} />
          </Panel>
        </div>
      </section>

      <section id="creators" className="v3-side v3-side-flip" aria-labelledby="creators-title">
        <div className="v3-side-copy">
          <p className="v3-pill" data-rise>
            For creators
          </p>
          <h2 id="creators-title" className="v3-h2" data-rise style={nth(1)}>
            Every open deal, <em>yours</em> to apply to.
          </h2>
          <Points
            items={[
              'See every open deal, with the amount and the dates up front.',
              'Apply for free. The amount is set, so there is nothing to negotiate.',
              'Get paid straight to your UPI ID: 30% before work, 70% after approval.',
              'Every deal you finish goes on your profile.',
            ]}
          />
        </div>
        <div className="v3-side-show" ref={creatorShow} data-rise style={nth(1)}>
          <div className="v3-glow v3-glow-soft" aria-hidden="true" />
          <Phone label="Example: a creator's applications and their status.">
            <CreatorApplications picked={confirmed} />
          </Phone>
        </div>
      </section>
    </>
  );
}
