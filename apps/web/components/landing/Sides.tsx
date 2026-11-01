'use client';

import { useEffect, useRef, useState } from 'react';
import { formatInr } from '@valueskins/shared';
import { Icon } from '@/components/ui/Icon';
import { formatCount, formatPercent } from '@/lib/format';
import { nth, useInView, useReducedMotion } from './motion';
import { EXAMPLE_DEALS, OTHER_APPLICANTS, STORY_CREATOR } from './screens/data';

/** Flips between two states every few seconds while on screen; rests on `true` otherwise. */
function useFlip(ref: React.RefObject<HTMLElement | null>, every: number) {
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (reduced || !inView) {
      setOn(true);
      return;
    }
    setOn(false);
    const t = setInterval(() => setOn((v) => !v), every);
    return () => clearInterval(t);
  }, [reduced, inView, every]);
  return on;
}

function Points({ items }: { items: string[] }) {
  return (
    <ul className="hm-points">
      {items.map((t, i) => (
        <li key={t} data-rise style={nth(i + 2)}>
          <Icon name="check" size={16} />
          {t}
        </li>
      ))}
    </ul>
  );
}

const APPLICANTS = [STORY_CREATOR, ...OTHER_APPLICANTS];

/** The brand's side: the applicants to a deal, and one of them picked. */
function Applicants({ picked }: { picked: boolean }) {
  return (
    <div
      className="hm-mini"
      role="img"
      aria-label="Example: a brand's applicants, with followers and engagement, and one picked."
    >
      <div inert>
        <div className="hm-mini-head">
          <p className="hm-strong">Applicants</p>
          <span className="hm-example">Example</span>
        </div>
        <ul className="hm-applicants">
          {APPLICANTS.map((a, i) => {
            const isPicked = picked && i === 0;
            return (
              <li key={a.handle} data-picked={isPicked || undefined}>
                <span className="hm-mono hm-mono-creator" aria-hidden="true">
                  {a.name
                    .split(' ')
                    .map((w) => w[0])
                    .join('')}
                </span>
                <div className="hm-applicant-who">
                  <p className="hm-strong">@{a.handle}</p>
                  <p className="hm-small">
                    {formatCount(a.followers)} followers, {formatPercent(a.engagement)}
                  </p>
                </div>
                <span className="hm-tag" data-on={isPicked || undefined}>
                  {isPicked ? 'Picked' : 'Profile'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

const OPEN_DEAL = EXAMPLE_DEALS[5]!;

/** The creator's side: an open deal with its amount set, and Apply pressed. */
function OpenDeal({ applied }: { applied: boolean }) {
  return (
    <div
      className="hm-mini hm-mini-deal"
      role="img"
      aria-label="Example: an open deal with its final amount, and a creator applying for free."
    >
      <div inert>
        <div className="hm-mini-head">
          <p className="hm-small">@{OPEN_DEAL.handle}</p>
          <span className="hm-example">Example</span>
        </div>
        <p className="hm-mini-title">{OPEN_DEAL.title}</p>
        <p className="hm-mini-amount hm-num">{formatInr(OPEN_DEAL.amountPaise)}</p>
        <div className="hm-mini-foot">
          <p className="hm-small">Apply by {OPEN_DEAL.applyBy}</p>
          <span className="hm-apply" data-on={applied || undefined}>
            {applied ? (
              <>
                <Icon name="check" size={16} />
                Applied
              </>
            ) : (
              'Apply free'
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * For brands and for creators, side by side and offset: what each side does, each with its own
 * small live picture.
 */
export function Sides() {
  const brandShow = useRef<HTMLDivElement>(null);
  const creatorShow = useRef<HTMLDivElement>(null);
  const picked = useFlip(brandShow, 3200);
  const applied = useFlip(creatorShow, 2800);
  return (
    <div className="hm-wrap hm-sides">
      <section id="brands" className="hm-side hm-side-brand" aria-labelledby="brands-title">
        <p className="hm-kicker" data-rise>
          For brands
        </p>
        <h2 id="brands-title" className="hm-h2" data-rise style={nth(1)}>
          Post once. Pick from who applies.
        </h2>
        <Points
          items={[
            'Say what you need, the deadline and the amount. The amount is final.',
            "Open each applicant's profile: followers, engagement and finished deals.",
            'Pick one. Pay 30% by UPI before work and 70% after you approve.',
          ]}
        />
        <div className="hm-side-show" ref={brandShow} data-rise style={nth(3)}>
          <Applicants picked={picked} />
        </div>
      </section>

      <section id="creators" className="hm-side hm-side-creator" aria-labelledby="creators-title">
        <p className="hm-kicker" data-rise>
          For creators
        </p>
        <h2 id="creators-title" className="hm-h2" data-rise style={nth(1)}>
          Every open deal. Apply for free.
        </h2>
        <Points
          items={[
            'See every open deal, with the amount and the dates up front.',
            'Get paid to your UPI ID and confirm each payment.',
            'Every deal you finish goes on your profile.',
          ]}
        />
        <div className="hm-side-show" ref={creatorShow} data-rise style={nth(3)}>
          <OpenDeal applied={applied} />
        </div>
      </section>
    </div>
  );
}
