import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

/** CLAUDE.md rule 2: a deal's status changes only through transitionDeal(). */
describe('who may write the deals table', () => {
  const writers = (pattern: RegExp) =>
    sourceFiles(SRC)
      .filter((file) => pattern.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))
      .sort();

  it('only transitionDeal and the draft editor update deals', () => {
    expect(writers(/\.update\(deals\)/)).toEqual([
      'deals/drafts.service.ts',
      'deals/stateMachine.ts',
    ]);
  });

  it('the draft editor never sets a status', () => {
    const source = readFileSync(join(SRC, 'deals/drafts.service.ts'), 'utf8');
    const update = source.slice(source.indexOf('.update(deals)'));
    const setCall = update.slice(0, update.indexOf('.where('));
    expect(setCall).not.toMatch(/status/);
  });

  it('only the draft editor deletes deals, and the seed inserts them', () => {
    expect(writers(/\.delete\(deals\)/)).toEqual(['deals/drafts.service.ts']);
    expect(writers(/\.insert\(deals\)/)).toEqual([
      'db/seed/dealMatrix.ts',
      'deals/drafts.service.ts',
    ]);
  });
});
