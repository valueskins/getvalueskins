'use client';

import { useEffect, type RefObject } from 'react';
import { prefersReducedMotion } from './motion';

/**
 * Pulls a button a few pixels towards the pointer while it hovers, as feedback that it is the
 * thing to press. Only for a fine pointer and without reduced motion; it writes two custom
 * properties on the element, so React never re-renders for it.
 */
export function useMagnet(ref: RefObject<HTMLElement | null>, reach = 10) {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    let frame = 0;
    const set = (x: number, y: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--mx', `${x.toFixed(1)}px`);
        el.style.setProperty('--my', `${y.toFixed(1)}px`);
      });
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      set(Math.max(-1, Math.min(1, dx)) * reach, Math.max(-1, Math.min(1, dy)) * reach * 0.6);
    };
    const onLeave = () => set(0, 0);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(frame);
    };
  }, [ref, reach]);
}
