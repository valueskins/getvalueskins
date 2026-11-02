// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The home page's lime means one thing, the creator's money: the two UPI payments and what the
 * creator receives. Magenta is the brand and every action, green only a status. Lime is a fill
 * under the dark ink, never text, an icon or a border on a light ground, where it cannot be read.
 */

const CSS = readFileSync(fileURLToPath(new URL('../app/home.css', import.meta.url)), 'utf8');

/** Every innermost `selector { declarations }` rule, comments removed. */
function rules(css: string): Array<{ selector: string; body: string }> {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim(),
    body: m[2]!,
  }));
}

/** The value of a token on `.hm`, with one level of var() resolved. */
function token(name: string): string {
  const hm = rules(CSS).find((r) => r.selector === '.hm' && r.body.includes('--hm-lime'))!;
  const value = hm.body.match(new RegExp(`${name}:\\s*([^;]+);`))![1]!.trim();
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? token(ref[1]!) : value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const LIME = /var\(--hm-lime(?:-soft)?\)/;

describe('lime, the creator money colour', () => {
  it('is only on the UPI payments and what the creator receives', () => {
    const used = rules(CSS)
      .filter((r) => LIME.test(r.body))
      .map((r) => r.selector);
    expect(used).toEqual([
      '.hm-split-advance',
      '.hm-split-final',
      '.hm-sat-amount',
      '.hm-sat-amount[data-final]',
      '.hm-how-n-upi',
      '.hm-calc-seg-advance',
      '.hm-calc-seg-final',
      '.hm-figure-advance',
      '.hm-figure-final',
      '.hm-figure-total',
    ]);
  });

  it('is only ever a fill, never text, an icon or a border', () => {
    const props = rules(CSS).flatMap((r) =>
      r.body
        .split(';')
        .map((d) => d.split(':'))
        .filter(([, value]) => value !== undefined && LIME.test(value))
        .map(([prop]) => prop!.trim()),
    );
    expect(new Set(props)).toEqual(new Set(['background', '--seg', '--swatch']));
  });

  it('has the dark ink on it, at AA or better', () => {
    const ink = token('--hm-on-lime');
    expect(contrast(ink, token('--hm-lime'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, token('--hm-lime-soft'))).toBeGreaterThanOrEqual(4.5);
    for (const r of rules(CSS).filter((x) => /background:\s*var\(--hm-lime/.test(x.body))) {
      // Every lime surface that holds text sets the on-lime ink. Bar segments hold no text, and the
      // data-final state inherits the ink from its base rule.
      if (r.selector.includes('-seg-') || r.selector.endsWith('[data-final]')) continue;
      expect(r.body, r.selector).toContain('color: var(--hm-on-lime)');
    }
  });
});
