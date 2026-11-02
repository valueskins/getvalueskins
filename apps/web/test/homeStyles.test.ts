// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Two rules of the home page's styles (app/home.css).
 *
 * Lime means one thing, the creator's money: the two UPI payments and what the creator receives.
 * Magenta is the brand and every action, green only a status. Lime is a fill under the dark ink,
 * never text, an icon or a border on a light ground, where it cannot be read.
 *
 * A field with a prefix or suffix inside its box shows one focus ring, the box's own.
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

  it('edges the pale 30% swatch in a darker lime that shows on the page, and nothing else', () => {
    const used = rules(CSS)
      .filter((r) => r.body.includes('var(--hm-lime-edge)'))
      .map((r) => r.selector);
    expect(used).toEqual(['.hm-figure-advance']);
    expect(contrast(token('--hm-lime-edge'), token('--hm-bg'))).toBeGreaterThanOrEqual(3);
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

describe('a field with a prefix inside its box', () => {
  it('rings only the box: the control inside draws no outline, border, shadow or ground', () => {
    // .hm :focus-visible rings every control on the page. Inside a [data-affix] box it would draw a
    // square outline on the input next to the box's rounded ring, so a later, stronger rule clears
    // the control's own focus styles there, and only there.
    const all = rules(CSS);
    const ring = all.findIndex((r) => r.selector === '.hm :focus-visible');
    const exception = all.findIndex(
      (r) => r.selector === '.hm [data-affix] :is(input, select, textarea):focus',
    );
    expect(ring).toBeGreaterThan(-1);
    expect(exception).toBeGreaterThan(ring);
    for (const reset of [
      'outline: none',
      'border: 0',
      'box-shadow: none',
      'background: transparent',
    ]) {
      expect(all[exception]!.body).toContain(reset);
    }
    // The ring stays on every other control.
    expect(all[ring]!.body).toContain('outline: 3px solid var(--hm-accent)');
    // The calculator's box draws the one ring, and lets clicks through its ₹ to the input.
    const box = all.find((r) => r.selector === '.hm-calc-input:focus-within')!;
    expect(box.body).toContain('box-shadow');
    expect(all.find((r) => r.selector === '.hm-calc-input > span')!.body).toContain(
      'pointer-events: none',
    );
  });
});

describe('the calculator at any amount', () => {
  it('keeps the fee visible in the bar, taking its width from the 70%', () => {
    const all = rules(CSS);
    const bar = all.find((r) => r.selector === '.hm-calc-bar')!;
    expect(bar.body).toContain('--fee-end: max(var(--fee, 0%), 10px)');
    expect(all.find((r) => r.selector === '.hm-calc-seg-advance')!.body).toContain(
      'transform: translateX(var(--fee-end))',
    );
    // The 70% starts after the fee and the true 30%, and runs to the end of the bar.
    expect(all.find((r) => r.selector === '.hm-calc-seg-final')!.body).toContain(
      'transform: translateX(calc(var(--fee-end) + var(--advance, 0%)))',
    );
  });

  it('sizes each amount to its tile, and goes four, two or one a row before it would be tiny', () => {
    const all = rules(CSS);
    const tile = all.find((r) => r.selector === '.hm-figure')!.body;
    expect(tile).toContain('container-type: inline-size');
    expect(tile).toContain('flex: 1 1 calc((4 * var(--fit) + 30px - 100%) * 999)');
    expect(tile).toContain(
      'max-width: max(calc(50% - 5px), calc((2 * var(--fit) + 10px - 100%) * 999))',
    );
    // 18px is the smallest an amount is set at while a layout with more room is left.
    expect(all.find((r) => r.selector === '.hm-figures')!.body).toContain(
      '--fit: calc(var(--num-em, 5) * 18px + 38px)',
    );
    const num = all.find((r) => r.selector === '.hm-figure > .hm-num')!.body;
    expect(num).toContain('calc((100cqi - 6px) / var(--num-em, 5))');
    expect(num).toContain('white-space: nowrap');
  });
});
