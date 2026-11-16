// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The design reference (docs/DESIGN.md) lists every colour pairing the app relies on, with the
 * contrast it must reach. This test reads that list and the token source (app/styles/tokens.css),
 * so a changed colour that breaks a pairing fails the build.
 */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const TOKENS = read('../app/styles/tokens.css');
const HOME = read('../app/home.css');
const DESIGN = read('../../../docs/DESIGN.md');

const declarations = new Map<string, string>(
  [...TOKENS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [
    m[1]!,
    m[2]!.trim(),
  ]),
);

/** A token's colour as `#rrggbb`, following var() references. */
function colour(name: string): string {
  const value = declarations.get(name);
  if (value === undefined) throw new Error(`${name} is not in tokens.css`);
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  if (ref) return colour(ref[1]!);
  if (!/^#[0-9a-f]{6}$/i.test(value))
    throw new Error(`${name} is not a plain hex colour: ${value}`);
  return value;
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

const PAIRINGS = [
  ...DESIGN.matchAll(/^\|\s*`(--[\w-]+)`\s*\|\s*`(--[\w-]+)`\s*\|\s*(4\.5|3)\s*\|\s*$/gm),
].map((m) => ({ fg: m[1]!, bg: m[2]!, min: Number(m[3]) }));

describe('docs/DESIGN.md colour pairings', () => {
  it('lists the pairings the app relies on', () => {
    expect(PAIRINGS.length).toBeGreaterThanOrEqual(60);
  });

  it.each(PAIRINGS.map((p) => [`${p.fg} on ${p.bg} is ${p.min}:1 or more`, p] as const))(
    '%s',
    (_name, p) => {
      expect(contrast(colour(p.fg), colour(p.bg))).toBeGreaterThanOrEqual(p.min);
    },
  );

  it('names only tokens that exist', () => {
    for (const p of PAIRINGS) {
      expect(declarations.has(p.fg), p.fg).toBe(true);
      expect(declarations.has(p.bg), p.bg).toBe(true);
    }
  });
});

describe('control edges', () => {
  it('the field edge reaches 3:1 on every home page ground a control sits on', () => {
    for (const ground of ['--hm-bg', '--hm-surface', '--hm-bg-2', '--hm-accent-soft']) {
      expect(contrast(colour('--hm-line-field'), colour(ground)), ground).toBeGreaterThanOrEqual(3);
    }
  });

  it('the home page amount field and outline pills use the field edge, not the rule colour', () => {
    const bare = HOME.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const selector of ['.hm-calc-input', '.hm-menu-btn', '.hm-free li', '.hm-faq-plus']) {
      const rule = bare.match(
        new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')} \\{([^}]*)\\}`),
      )!;
      expect(rule[1], selector).toMatch(/border:[^;]*var\(--hm-line-field\)/);
    }
  });

  it('danger is not the accent: they differ, and danger never shares the accent soft ground', () => {
    expect(colour('--danger')).not.toBe(colour('--accent'));
    expect(colour('--danger-soft')).not.toBe(colour('--accent-soft'));
  });
});

describe('lime in the app styles', () => {
  const dir = fileURLToPath(new URL('../app/styles/', import.meta.url));
  const files = [
    ...readdirSync(dir)
      .filter((f) => f.endsWith('.css') && f !== 'tokens.css')
      .map((f) => `../app/styles/${f}`),
    '../app/public.css',
  ];
  const rules = files.flatMap((f) =>
    [
      ...read(f)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/([^{}]+)\{([^{}]*)\}/g),
    ].map((m) => ({
      selectors: m[1]!.split(',').map((x) => x.trim()),
      body: m[2]!,
    })),
  );
  const declarations = (body: string) =>
    body
      .split(';')
      .map((d) => d.split(/:(.*)/s))
      .filter(([prop]) => prop?.trim())
      .map(([prop, value]) => [prop!.trim(), (value ?? '').trim()] as const);

  const MONEY = new Set([
    '.money-creator',
    '.money-creator-soft',
    '.pic-lime',
    '.pic-lime-soft',
    '.pic-received .pic-received-amount',
  ]);
  const SOFT = new Set(['.money-creator-soft', '.pic-lime-soft']);

  it('is used only on the creator money classes', () => {
    const used = rules
      .filter((r) => /var\(--(?:hm-)?lime/.test(r.body))
      .flatMap((r) => r.selectors);
    expect(used.length).toBeGreaterThan(0);
    for (const selector of used) expect(MONEY.has(selector), selector).toBe(true);
  });

  it('is only ever a fill, with the ink on it, and the soft swatch edge', () => {
    for (const rule of rules) {
      for (const [prop, value] of declarations(rule.body)) {
        if (/var\(--(?:hm-)?lime(?:-soft)?\)/.test(value)) expect(prop).toBe('background');
        if (/var\(--(?:hm-)?lime-edge\)/.test(value)) {
          for (const selector of rule.selectors) expect(SOFT.has(selector), selector).toBe(true);
          expect(prop).toBe('box-shadow');
        }
      }
    }
    for (const selector of ['.money-creator', '.pic-lime', '.pic-received .pic-received-amount']) {
      const rule = rules.find((r) => r.selectors.includes(selector))!;
      expect(rule.body, selector).toMatch(/color:\s*var\(--lime-ink\)/);
    }
  });
});
