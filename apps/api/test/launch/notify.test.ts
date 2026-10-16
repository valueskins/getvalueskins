import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { emailLog, users } from '../../src/db/schema/index.js';
import { runLaunchNotify } from '../../src/launch/notify.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
import { NOW, brandWithBilling, creatorWithPayout, sentEmails } from '../helpers/deals.js';
import { buildRawTestEnv, buildTestEnv } from '../testEnv.js';

const ctx = { env: buildTestEnv(), now: () => NOW };
const API_ROOT = path.resolve(import.meta.dirname, '../..');

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

/** Three brands who should be told, and the accounts who should not. */
async function seedAccounts() {
  const brands = [await brandWithBilling(), await brandWithBilling(), await brandWithBilling()];
  const creators = [await creatorWithPayout(), await creatorWithPayout()];
  const admin = await brandWithBilling({ isAdmin: true });

  // Not onboarded, email not verified, no email, deleted: none of these are told.
  await createUserWithSession({
    role: 'BRAND',
    email: 'not-onboarded@example.com',
    emailVerifiedAt: new Date(),
  });
  await brandWithBilling({ emailVerifiedAt: null });
  await brandWithBilling({ email: null, emailVerifiedAt: null });
  const gone = await brandWithBilling();
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, gone.user.id));
  // An account that has not chosen a role.
  await createUserWithSession({
    email: 'norole@example.com',
    emailVerifiedAt: new Date(),
    onboardingCompletedAt: new Date(),
  });
  return { brands, creators, admin };
}

describe('runLaunchNotify', () => {
  it('a dry run counts and sends nothing', async () => {
    await seedAccounts();
    const result = await runLaunchNotify(ctx, { audience: 'brands', send: false });
    expect(result).toEqual({
      audience: 'brands',
      sent: false,
      eligible: 4, // three brands and the admin who is also a brand
      alreadySent: 0,
      toSend: 4,
      delivered: 0,
      failed: 0,
    });
    expect(await sentEmails()).toHaveLength(0);
  });

  it('--send emails each onboarded, verified, live brand once, and logs it', async () => {
    const { brands, creators } = await seedAccounts();
    const result = await runLaunchNotify(ctx, { audience: 'brands', send: true });
    expect(result).toMatchObject({ sent: true, toSend: 4, delivered: 4, failed: 0 });

    const rows = await sentEmails('LAUNCH_BRANDS');
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.status === 'SENT' && r.subject === 'Posting deals is open')).toBe(
      true,
    );
    const told = new Set(rows.map((r) => r.userId));
    for (const b of brands) expect(told.has(b.user.id)).toBe(true);
    for (const c of creators) expect(told.has(c.user.id)).toBe(false);
    expect(rows[0]?.bodyText).toContain(ctx.env.WEB_ORIGIN);
  });

  it('a second --send sends nothing', async () => {
    await seedAccounts();
    await runLaunchNotify(ctx, { audience: 'brands', send: true });
    const again = await runLaunchNotify(ctx, { audience: 'brands', send: true });
    expect(again).toMatchObject({ eligible: 4, alreadySent: 4, toSend: 0, delivered: 0 });
    expect(await sentEmails('LAUNCH_BRANDS')).toHaveLength(4);
  });

  it('a dry run after a send reports them as already sent', async () => {
    await seedAccounts();
    await runLaunchNotify(ctx, { audience: 'creators', send: true });
    const dry = await runLaunchNotify(ctx, { audience: 'creators', send: false });
    expect(dry).toMatchObject({ eligible: 2, alreadySent: 2, toSend: 0 });
  });

  it('creators get their own template and subject', async () => {
    const { creators, brands } = await seedAccounts();
    const result = await runLaunchNotify(ctx, { audience: 'creators', send: true });
    expect(result).toMatchObject({ delivered: 2 });
    const rows = await sentEmails('LAUNCH_CREATORS');
    expect(rows.map((r) => r.userId).sort()).toEqual(creators.map((c) => c.user.id).sort());
    expect(rows.every((r) => r.subject === 'Deals are opening')).toBe(true);
    expect(await sentEmails('LAUNCH_BRANDS')).toHaveLength(0);
    expect(rows.some((r) => brands.some((b) => b.user.id === r.userId))).toBe(false);
  });

  it('the two audiences are independent: telling brands does not stop creators', async () => {
    await seedAccounts();
    await runLaunchNotify(ctx, { audience: 'brands', send: true });
    const creators = await runLaunchNotify(ctx, { audience: 'creators', send: false });
    expect(creators).toMatchObject({ alreadySent: 0, toSend: 2 });
  });

  it('a failed send is tried again, and a queued one counts as sent', async () => {
    const { brands } = await seedAccounts();
    const [failed, queued] = [brands[0]!, brands[1]!];
    const row = (userId: string, status: 'FAILED' | 'QUEUED') => ({
      userId,
      toEmail: 'x@example.com',
      template: 'LAUNCH_BRANDS',
      subject: 'Posting deals is open',
      bodyText: 'x',
      status,
    });
    await db
      .insert(emailLog)
      .values([row(failed.user.id, 'FAILED'), row(queued.user.id, 'QUEUED')]);

    const result = await runLaunchNotify(ctx, { audience: 'brands', send: true });
    expect(result).toMatchObject({ eligible: 4, alreadySent: 1, toSend: 3, delivered: 3 });
    const forFailed = (await sentEmails('LAUNCH_BRANDS')).filter(
      (r) => r.userId === failed.user.id,
    );
    expect(forFailed.map((r) => r.status).sort()).toEqual(['FAILED', 'SENT']);
  });

  it('two runs at once send each email once', async () => {
    await seedAccounts();
    const results = await Promise.all([
      runLaunchNotify(ctx, { audience: 'brands', send: true }),
      runLaunchNotify(ctx, { audience: 'brands', send: true }),
    ]);
    expect(await sentEmails('LAUNCH_BRANDS')).toHaveLength(4);
    // Either the second run was refused (null) or it ran after the first and found nothing to send.
    const delivered = results.reduce((n, r) => n + (r?.delivered ?? 0), 0);
    expect(delivered).toBe(4);
  });

  it('never writes an address into the result', async () => {
    await seedAccounts();
    const result = await runLaunchNotify(ctx, { audience: 'brands', send: true });
    expect(JSON.stringify(result)).not.toContain('@');
  });
});

describe('pnpm notify:launch (the script)', () => {
  function run(...args: string[]) {
    return spawnSync('npx', ['tsx', 'src/scripts/notifyLaunch.ts', ...args], {
      cwd: API_ROOT,
      env: { ...process.env, ...buildRawTestEnv() },
      encoding: 'utf8',
    });
  }

  it.each([[[]], [['--audience']], [['--audience', 'everyone']], [['--send']], [['--bogus']]])(
    'prints usage and exits 1 for %j',
    (args) => {
      const result = run(...args);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'Usage: pnpm notify:launch --audience brands|creators [--send]',
      );
    },
  );

  it('is a dry run by default: counts only, no email, no address in the output', async () => {
    await seedAccounts();
    const result = run('--audience', 'brands');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"toSend":4');
    expect(result.stdout).toContain('Dry run: nothing was sent');
    expect(result.stdout + result.stderr).not.toContain('@example.com');
    expect(await sentEmails()).toHaveLength(0);
  }, 30_000);

  it('--send sends, and a second --send sends nothing', async () => {
    await seedAccounts();
    const first = run('--audience', 'creators', '--send');
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('"delivered":2');
    expect(await sentEmails('LAUNCH_CREATORS')).toHaveLength(2);

    const second = run('--audience', 'creators', '--send');
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('"delivered":0');
    expect(second.stdout).toContain('"alreadySent":2');
    expect(await sentEmails('LAUNCH_CREATORS')).toHaveLength(2);
  }, 60_000);
});
