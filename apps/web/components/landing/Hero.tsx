'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { DealTicket, LAST_BEAT, type Beat } from './DealTicket';
import { HomeSignIn } from './HomeSignIn';
import { useInView, useReducedMotion } from './motion';

/** When each beat starts, in milliseconds into the loop; the loop is 14 seconds. */
const BEATS: number[] = [0, 1800, 3600, 5400, 7200, 9000, 10_800];
const LOOP_MS = 14_000;

/**
 * Plays the deal's story while the hero is on screen, and carries on from where it was after a
 * pause. It rests on the finished deal without script, under reduced motion and when paused before
 * it starts.
 */
function useStory(running: boolean): Beat {
  const [beat, setBeat] = useState<Beat>(LAST_BEAT);
  const current = useRef<Beat>(LAST_BEAT);
  const started = useRef(false);
  useEffect(() => {
    if (!running) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const show = (b: Beat) => {
      current.current = b;
      setBeat(b);
    };
    const play = (from: Beat) => {
      const offset = BEATS[from]!;
      timers = BEATS.slice(from).map((at, i) =>
        setTimeout(() => show((from + i) as Beat), at - offset),
      );
      timers.push(setTimeout(() => play(0), LOOP_MS - offset));
    };
    // The first time, the finished deal stays a moment, then the story starts from the top.
    if (started.current) play(current.current);
    else timers.push(setTimeout(() => play(0), 1200));
    started.current = true;
    return () => timers.forEach(clearTimeout);
  }, [running]);
  return beat;
}

/** Leans the picture's layers a little towards the pointer, on a fine pointer only. */
function useDepth(scope: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = scope.current;
    if (!el || !enabled || !window.matchMedia('(pointer: fine)').matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width - 0.5)) * 2;
      const y = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height - 0.5)) * 2;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--px', x.toFixed(3));
        el.style.setProperty('--py', y.toFixed(3));
      });
    };
    el.addEventListener('pointermove', onMove);
    return () => {
      el.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, [scope, enabled]);
}

export function Hero({ emailSignIn }: { emailSignIn: boolean }) {
  const reduced = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const inView = useInView(section);
  const [paused, setPaused] = useState(false);
  const beat = useStory(inView && !reduced && !paused);
  useDepth(section, inView && !reduced);

  return (
    <section className="hm-hero" ref={section} aria-labelledby="hero-title">
      <div className="hm-wrap hm-hero-grid">
        <div className="hm-hero-copy">
          <h1 id="hero-title" className="hm-h1">
            <span className="hm-line">
              <span>Paid deals,</span>
            </span>{' '}
            <span className="hm-line hm-line-accent">
              <span>no haggling.</span>
            </span>
          </h1>
          <p className="hm-lede hm-enter" style={{ ['--d' as string]: '420ms' }}>
            Indian brands post paid Instagram deals. Creators apply for free. Every finished deal
            goes on both profiles.
          </p>
          <div
            id="main"
            tabIndex={-1}
            className="hm-hero-act hm-enter"
            style={{ ['--d' as string]: '560ms' }}
          >
            <HomeSignIn />
            {emailSignIn ? (
              <Link href="/signin/email" className="hm-text-link">
                Sign in with email
              </Link>
            ) : null}
          </div>
        </div>

        <div className="hm-hero-show hm-enter" style={{ ['--d' as string]: '200ms' }}>
          <DealTicket beat={beat} />
          {reduced ? null : (
            <button
              type="button"
              className="hm-pause"
              aria-pressed={paused}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? 'Play the example' : 'Pause the example'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
