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

/**
 * REPLACEMENT_PLAN 2.1: a creator's UPI ID is shown in full only to the brand confirmed on a deal,
 * so only the code that saves it, the one gate that checks it, the seed and account deletion may
 * touch the column. Anything else that needs it goes through those.
 */
describe('who may touch users.payout_vpa', () => {
  const writers = (pattern: RegExp) =>
    sourceFiles(SRC)
      .filter((file) => pattern.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))
      .sort();

  it('only the payout module, the payout gate, the seed, deletion and the schema read or write it', () => {
    expect(writers(/payoutVpa\b/)).toEqual([
      'db/schema/users.ts',
      'db/seed/index.ts',
      'deals/payoutDetails.ts',
      'meta/deletion.service.ts',
      'onboarding/onboarding.service.ts',
      'payout/payoutUpi.service.ts',
    ]);
  });

  it('no route file touches it', () => {
    expect(writers(/payoutVpa\b/).filter((file) => file.endsWith('.routes.ts'))).toEqual([]);
  });
});

/**
 * REPLACEMENT_PLAN 2.1: a direct payment record is never edited or deleted once it is confirmed
 * or disputed, and the UPI ID it snapshotted is never returned in full. So only the service writes
 * the table, and only the code that builds a masked view or a document may read the ID.
 */
describe('who may touch direct_payments', () => {
  const writers = (pattern: RegExp) =>
    sourceFiles(SRC)
      .filter((file) => pattern.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))
      .sort();

  it('only the direct payments service and the seed write the table, and nothing deletes from it', () => {
    expect(writers(/\.(insert|update)\(directPayments\)/)).toEqual([
      'db/seed/dealMatrix.ts',
      'directPayments/directPayments.service.ts',
    ]);
    expect(writers(/\.delete\(directPayments\)/)).toEqual([]);
  });

  it('only the service, the masked view, the document issuer and the seed handle paid_to_vpa', () => {
    expect(writers(/paidToVpa\b/)).toEqual([
      'db/schema/payments.ts',
      'db/seed/dealMatrix.ts',
      'directPayments/directPayments.service.ts',
      'directPayments/view.ts',
      'invoices/issueInvoice.ts',
    ]);
  });
});

/**
 * SPEC 15: a deal's history is written by the state machine (status changes) and by the payment
 * record helper (a recorded or not-received payment, in the same transaction as that change). The
 * seed inserts its own. Nothing else may add or change an event.
 */
describe('who may write deal_events', () => {
  const writers = (pattern: RegExp) =>
    sourceFiles(SRC)
      .filter((file) => pattern.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))
      .sort();

  it('only the state machine, the payment event helper and the seed insert events', () => {
    expect(writers(/\.insert\(dealEvents\)/)).toEqual([
      'db/seed/dealMatrix.ts',
      'deals/dealEvents.ts',
      'deals/stateMachine.ts',
    ]);
  });

  it('nothing updates or deletes an event', () => {
    expect(writers(/\.(update|delete)\(dealEvents\)/)).toEqual([]);
  });
});
