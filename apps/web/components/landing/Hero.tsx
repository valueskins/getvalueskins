'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from './motion';
import { BrandApplicants, CreatorFeed, Panel, Phone, ReceivedCard } from './screens/Screens';
import { SignIn } from './SignIn';

/**
 * The story the hero's screens play, one beat at a time, about 13 seconds a loop:
 * a new deal reaches the creator's feed, they apply, the application reaches the brand, the brand
 * picks them, and the 30% advance lands and is confirmed. Then it starts again.
 */
const BEATS = [
  { at: 0 }, // 0: the feed as it was
  { at: 900 }, // 1: a new deal slides in
  { at: 3000 }, // 2: Apply is pressed
  { at: 3600 }, // 3: Applied
  { at: 4800 }, // 4: the application reaches the brand
  { at: 7000 }, // 5: the brand picks the creator
  { at: 9000 }, // 6: 30% received, counting up
];
const LOOP_MS = 13_000;
/** Where the story rests: under reduced motion, without script, and when paused before it starts. */
const FINAL = 6;

function useStory(running: boolean): number {
  const [beat, setBeat] = useState(FINAL);
  const started = useRef(false);
  useEffect(() => {
    if (!running) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const play = (from: number) => {
      const offset = BEATS[from]!.at;
      timers = BEATS.slice(from).map((b, i) => setTimeout(() => setBeat(from + i), b.at - offset));
      timers.push(setTimeout(() => play(0), LOOP_MS - offset));
    };
    // The first time, start the story from the beginning; after a pause, carry on from where it was.
    play(started.current ? beat : 0);
    started.current = true;
    return () => timers.forEach(clearTimeout);
    // The beat is read only when the loop restarts, so it is not a dependency.
  }, [running]);
  return beat;
}

/** Tilts the stage a few degrees towards the pointer, or with scroll on touch screens. */
function useTilt(stage: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = stage.current;
    if (!el || !enabled) return;
    let frame = 0;
    const set = (rx: number, ry: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
        el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
      });
    };
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (coarse) {
      const onScroll = () => {
        const r = el.getBoundingClientRect();
        const t = Math.max(-1, Math.min(1, (r.top + r.height / 2 - innerHeight / 2) / innerHeight));
        set(t * 6, t * -4);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      return () => {
        window.removeEventListener('scroll', onScroll);
        cancelAnimationFrame(frame);
      };
    }
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / innerWidth;
      const y = (e.clientY - (r.top + r.height / 2)) / innerHeight;
      set(Math.max(-1, Math.min(1, y)) * -7, Math.max(-1, Math.min(1, x)) * 9);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, [stage, enabled]);
}

type View = 'creators' | 'brands';

export function Hero({ emailSignIn }: { emailSignIn: boolean }) {
  const reduced = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const inView = useInView(stage);
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<View>('creators');
  const beat = useStory(inView && !reduced && !paused);
  useTilt(stage, inView && !reduced);

  return (
    <section className="v3-hero" aria-labelledby="hero-title">
      <div className="v3-hero-copy">
        <p className="v3-pill" data-rise>
          For Indian brands and Instagram creators
        </p>
        <h1 id="hero-title" className="v3-h1" data-rise>
          Where Indian brands and creators <em>work</em> together
        </h1>
        <p className="v3-lede" data-rise>
          Brands post paid deals. Creators apply. Every finished deal goes on both profiles.
        </p>
        <div id="main" tabIndex={-1} className="v3-hero-act" data-rise>
          <SignIn />
          {emailSignIn ? (
            <Link href="/signin/email" className="v3-text-link">
              Sign in with email
            </Link>
          ) : null}
        </div>
      </div>

      <div className="v3-hero-show">
        <div className="v3-preview-bar">
          <div className="v3-switch" role="group" aria-label="Preview the app">
            <span className="v3-switch-label" aria-hidden="true">
              Preview
            </span>
            {(
              [
                ['creators', 'What creators see'],
                ['brands', 'What brands see'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                className={view === key ? 'is-on' : undefined}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {reduced ? null : (
            <button
              type="button"
              className="v3-pause"
              aria-pressed={paused}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? 'Play preview' : 'Pause preview'}
            </button>
          )}
        </div>
        <div className="v3-stage" ref={stage} data-view={view}>
          <div className="v3-glow" aria-hidden="true" />
          <div className="v3-stage-tilt">
            <div className="v3-stage-panel">
              <Panel
                title="Your deal"
                label="Example: a brand's posted deal and the creators who applied to it."
              >
                <BrandApplicants showNew={beat >= 4} picked={beat >= 5} />
              </Panel>
            </div>
            <div className="v3-stage-phone">
              <Phone label="Example: a creator's open deals, and a payment they confirmed.">
                <CreatorFeed
                  showNew={beat >= 1}
                  applyState={beat >= 3 ? 'applied' : beat === 2 ? 'pressed' : 'open'}
                />
                <ReceivedCard shown={beat >= 6} />
              </Phone>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
