// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The copy rules (CLAUDE.md section 12, SPEC 18): no emojis, no em or en dashes and none of
 * the banned words, in the web app, the email templates and the shared copy. The banned words
 * are read from CLAUDE.md itself, so the list here can never drift from it.
 */

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TARGETS = ['apps/web', 'apps/api/src/email', 'packages/shared/src/copy.ts'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'coverage']);
// This file names the rules it checks, so it is the one file left out.
const SKIP_FILES = new Set(['next-env.d.ts', 'copyRules.test.ts']);
const EXTENSIONS = /\.(ts|tsx|md|css|json|mjs)$/;

function filesUnder(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    if (statSync(child).isDirectory()) return SKIP_DIRS.has(name) ? [] : filesUnder(child);
    return EXTENSIONS.test(name) && !SKIP_FILES.has(name) ? [child] : [];
  });
}

/** The words on the "None of these words:" line of CLAUDE.md section 12. */
export function bannedWords(claudeMd: string): string[] {
  const line = claudeMd.split('\n').find((l) => l.includes('None of these words:'));
  if (!line) return [];
  const list = line.slice(line.indexOf('None of these words:') + 'None of these words:'.length);
  return list
    .replace(/\.\s*$/, '')
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

/** A whole-word match for the word and its usual endings (-s, -ed, -ing, -ly). */
function wordPattern(word: string): RegExp {
  const base = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const stem = base.endsWith('e') ? `${base.slice(0, -1)}(?:e|es|ed|ing)` : `${base}(?:s|ed|ing|ly)?`;
  return new RegExp(`\\b${stem}\\b`, 'i');
}

// Built from code points so this file does not trip its own check.
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const DASHES = [EM, EN, '&' + 'mdash;', '&' + 'ndash;', '\\' + 'u2014', '\\' + 'u2013'];
// ©, ® and ™ are legal marks, not emojis.
const ALLOWED_PICTOGRAPHS = new Set(['©', '®', '™']);
const PICTOGRAPH = /\p{Extended_Pictographic}|\uFE0F/gu;

export interface Hit {
  file: string;
  line: number;
  what: string;
}

export function findHits(file: string, text: string, words: string[]): Hit[] {
  const patterns = words.map((w) => ({ w, re: wordPattern(w) }));
  const hits: Hit[] = [];
  text.split('\n').forEach((content, i) => {
    const at = (what: string) => hits.push({ file, line: i + 1, what });
    for (const dash of DASHES) if (content.includes(dash)) at(`dash ${JSON.stringify(dash)}`);
    for (const m of content.match(PICTOGRAPH) ?? []) {
      if (!ALLOWED_PICTOGRAPHS.has(m)) at(`emoji ${m}`);
    }
    for (const { w, re } of patterns) if (re.test(content)) at(`banned word "${w}"`);
  });
  return hits;
}

describe('copy rules', () => {
  const words = bannedWords(readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8'));

  it('reads the banned words from CLAUDE.md', () => {
    expect(words).toHaveLength(7);
    expect(words).toContain('powered by');
  });

  it('finds each kind of hit', () => {
    const [unlock, , , poweredBy, , , elevate] = words;
    const sample = [
      `A ${EM} B`,
      `1${EN}3 Oct`,
      'Party time \u{1F389}',
      `This will ${elevate} your reels`,
      `${unlock!.toUpperCase()}ED for you`,
      `${poweredBy!.replace(' ', '  ')} us`,
      'Copyright © 2026 ValueSkins',
      'Elevation and seamstress are fine',
    ].join('\n');
    expect(findHits('x.ts', sample, words).map((h) => h.line)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('finds no emoji, em or en dash or banned word in the web app, the emails or the shared copy', () => {
    const files = TARGETS.flatMap((t) => filesUnder(join(ROOT, t)));
    expect(files.length).toBeGreaterThan(50);
    const hits = files.flatMap((f) => findHits(relative(ROOT, f), readFileSync(f, 'utf8'), words));
    expect(hits.map((h) => `${h.file}:${h.line} ${h.what}`)).toEqual([]);
  });
});
