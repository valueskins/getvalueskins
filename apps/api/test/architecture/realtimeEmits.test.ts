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

const using = (pattern: RegExp) =>
  sourceFiles(SRC)
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC, file))
    .sort();

/**
 * SPEC 10, CLAUDE.md 6.2: events leave only after a commit, and one transition sends one set of
 * events. So deal transitions emit from one place, and the rest of the code reaches sockets only
 * through the helpers in realtime/events.ts.
 */
describe('who may send realtime events', () => {
  it('only transitionDeal sends the per-transition events', () => {
    expect(using(/emitDealTransition\(/)).toEqual(['deals/stateMachine.ts', 'realtime/events.ts']);
  });

  it('only the realtime helpers read the emitter, and only the server installs it', () => {
    expect(using(/getRealtime\(/)).toEqual(['realtime/emitter.ts', 'realtime/events.ts']);
    expect(using(/setRealtime\(/)).toEqual(['realtime/emitter.ts', 'realtime/server.ts']);
  });

  it('only the named service points send deal:updated, deal:summary and application:new outside a transition', () => {
    expect(using(/emitDealUpdated\(/)).toEqual([
      'disputes/disputes.service.ts',
      'realtime/events.ts',
    ]);
    expect(using(/emitDealSummary\(/)).toEqual(['realtime/events.ts']);
    expect(using(/emitDealChanged\(/)).toEqual([
      'directPayments/directPayments.service.ts',
      'payments/markPaymentCaptured.ts',
      'realtime/events.ts',
    ]);
    expect(using(/emitApplicationNew\(/)).toEqual([
      'applications/applications.service.ts',
      'realtime/events.ts',
    ]);
  });

  it('the realtime code never writes deals and never reads UPI IDs', () => {
    for (const file of sourceFiles(join(SRC, 'realtime'))) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/\.update\(deals\)|\.insert\(deals\)|\.delete\(deals\)/);
      expect(source).not.toMatch(/payoutVpa|paidToVpa|payoutName/);
    }
  });

  it('nothing in the realtime code logs the handshake, its headers or the session token', () => {
    const source = readFileSync(join(SRC, 'realtime/server.ts'), 'utf8');
    const calls = [...source.matchAll(/logger\.\w+\(([\s\S]*?)\);/g)].map((m) => m[1] ?? '');
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).not.toMatch(/handshake|\.headers|socket\.request|sessionToken|\btoken\b/);
    }
  });
});
