'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/** True when the visitor asked for less motion (or the browser cannot say). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Follows `prefers-reduced-motion` as it changes. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/** Whether the element is on screen and the tab is visible: animations run only then. */
export function useInView<T extends Element>(ref: RefObject<T | null>, margin = '0px'): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let visible = false;
    const update = () => setInView(visible && document.visibilityState === 'visible');
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        update();
      },
      { rootMargin: margin },
    );
    io.observe(el);
    document.addEventListener('visibilitychange', update);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [ref, margin]);
  return inView;
}

/**
 * The entrances: once script runs the root is marked `js`, and `[data-rise]` parts start a little
 * low and transparent, then rise in with a short stagger as they enter. Without script, or under
 * reduced motion, everything is simply there.
 */
export function useRiseIn(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    el.classList.add('js');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    el.querySelectorAll('[data-rise]').forEach((n) => io.observe(n));
    return () => {
      io.disconnect();
      el.classList.remove('js');
    };
  }, [root]);
}

/**
 * A whole number of paise that eases to `target` over `ms`. Every value shown is a whole number of
 * paise, and the last one is exactly `target`; under reduced motion it jumps straight there.
 */
export function useCountUp(target: number, ms = 600, from?: number): number {
  const [shown, setShown] = useState(from ?? target);
  const current = useRef(from ?? target);
  useEffect(() => {
    const start = current.current;
    if (start === target || prefersReducedMotion()) {
      current.current = target;
      setShown(target);
      return;
    }
    let frame = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const eased = 1 - (1 - t) ** 3;
      const value = t === 1 ? target : start + Math.round((target - start) * eased);
      current.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    // Animation frames stop in a background tab; the exact figure must still arrive.
    const settle = setTimeout(() => {
      cancelAnimationFrame(frame);
      current.current = target;
      setShown(target);
    }, ms + 100);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [target, ms]);
  return shown;
}

/** The stagger of one part within its group, as the `--i` custom property. */
export function nth(i: number): React.CSSProperties {
  return { ['--i' as string]: i };
}
