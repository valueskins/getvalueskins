// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The site is light only, whatever the visitor's system or browser setting (SPEC, the look). No
 * stylesheet or component follows a dark setting, and every page tells the browser it is light
 * only, so form controls, scrollbars and the browser's own forced dark theme stay light too.
 */

const WEB = fileURLToPath(new URL('../', import.meta.url));
const DIRS = ['app', 'components', 'lib'];
const EXTENSIONS = /\.(ts|tsx|css)$/;

function filesUnder(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    if (statSync(child).isDirectory()) return filesUnder(child);
    return EXTENSIONS.test(name) ? [child] : [];
  });
}

const DARK = [
  /prefers-color-scheme/,
  /color-scheme:(?!\s*only light;)/,
  /data-theme/,
  /\.dark\b/,
  // Tailwind's dark: variant (a --dark token is the contrast sections' ground, not a dark mode).
  /(?<![\w-])dark:/,
  /next-themes/,
];

describe('light only', () => {
  it('has no dark styles, theme switching or theme toggle', () => {
    const hits = DIRS.flatMap((dir) => filesUnder(join(WEB, dir))).flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return DARK.filter((re) => re.test(text)).map((re) => `${relative(WEB, file)}: ${re}`);
    });
    expect(hits).toEqual([]);
  });

  it('declares only light on the page and in the meta tag', () => {
    const base = readFileSync(join(WEB, 'app/styles/base.css'), 'utf8');
    expect(base).toMatch(/html\s*{\s*color-scheme:\s*only light;\s*}/);
    const layout = readFileSync(join(WEB, 'app/layout.tsx'), 'utf8');
    expect(layout).toContain("colorScheme: 'only light'");
  });
});
