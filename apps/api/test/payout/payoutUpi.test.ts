import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema/index.js';
import { softDeleteAndAnonymizeUser } from '../../src/meta/deletion.service.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { createUserWithSession } from '../helpers/auth.js';
import { NOW, brandWithBilling, creatorWithPayout, http } from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();
const api = http(createApp(env, { now: () => NOW }));

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

const VPA = 'raj.creator@okhdfcbank';
const BODY = { vpa: VPA, name: 'Raj Kumar', consent: true };
const MASKED = 'ra•••@okhdfcbank';

const save = (cookie: string | undefined, body: object = BODY) =>
  api.send('put', '/api/me/payout-upi', cookie, body);
const read = (cookie?: string) => api.get('/api/me/payout-upi', cookie);
const row = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0]!;

describe('PUT /api/me/payout-upi', () => {
  it('saves the details, answers with the masked ID and finishes the payout step', async () => {
    const creator = await creatorWithPayout(null);

    const res = await save(creator.cookie);
    expect(res.status).toBe(200);
    expect(res.body.payoutUpi).toEqual({
      maskedVpa: MASKED,
      name: 'Raj Kumar',
      consentAt: NOW.toISOString(),
    });
    expect(res.body.onboarding.steps).toContainEqual({ id: 'payout', done: true, required: false });
    expect(JSON.stringify(res.body)).not.toContain(VPA);

    expect(await row(creator.user.id)).toMatchObject({
      payoutVpa: VPA,
      payoutName: 'Raj Kumar',
    });
    expect((await row(creator.user.id)).payoutVpaConsentAt?.toISOString()).toBe(NOW.toISOString());
  });

  it('stores the UPI ID in lower case and trims the name', async () => {
    const creator = await creatorWithPayout(null);
    await save(creator.cookie, {
      vpa: ' Raj.Creator@OkHdfcBank ',
      name: '  Raj Kumar ',
      consent: true,
    });
    expect(await row(creator.user.id)).toMatchObject({ payoutVpa: VPA, payoutName: 'Raj Kumar' });
  });

  it('saving again replaces the details', async () => {
    const creator = await creatorWithPayout(null);
    await save(creator.cookie);
    const res = await save(creator.cookie, {
      vpa: 'second@ybl',
      name: 'Second Name',
      consent: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.payoutUpi.maskedVpa).toBe('se•••@ybl');
    expect(await row(creator.user.id)).toMatchObject({
      payoutVpa: 'second@ybl',
      payoutName: 'Second Name',
    });
  });

  it('does not make an unfinished account complete: the payout step is optional', async () => {
    const creator = await createUserWithSession({
      role: 'CREATOR',
      email: 'new.creator@example.com',
      emailVerifiedAt: new Date(),
      instagramUserId: 'ig-new-creator',
      profileLockedAt: new Date(),
    });
    const res = await save(creator.cookie);
    expect(res.status).toBe(200);
    // Email verified and profile saved: onboarding completes with or without the payout step.
    expect(res.body.onboarding.completed).toBe(true);
  });

  it.each([
    ['a bank account number', { vpa: '123456789012' }, 'looks like a bank account number'],
    ['a spaced bank account number', { vpa: '1234 5678 9012' }, 'looks like a bank account number'],
    ['a PAN', { vpa: 'ABCPE1234F' }, 'looks like a PAN'],
    ['an IFSC code', { vpa: 'HDFC0001234' }, 'looks like an IFSC code'],
    ['no @', { vpa: 'rajcreator' }, 'Not a valid UPI ID'],
    ['no handle', { vpa: 'raj@' }, 'Not a valid UPI ID'],
    ['a bank account number as the name', { name: '123456789012' }, 'not a number or code'],
    ['a PAN as the name', { name: 'ABCPE1234F' }, 'not a number or code'],
  ])('refuses %s with a clear message and saves nothing', async (_label, change, text) => {
    const creator = await creatorWithPayout(null);
    const res = await save(creator.cookie, { ...BODY, ...change });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body.error.details)).toContain(text);
    // The error never repeats what was typed.
    for (const typed of Object.values(change)) {
      expect(JSON.stringify(res.body)).not.toContain(typed);
    }
    expect(await row(creator.user.id)).toMatchObject({ payoutVpa: null, payoutName: null });
  });

  it.each([
    { consent: false },
    { consent: 'yes' },
    { pan: 'ABCPE1234F' },
    { ifsc: 'HDFC0001234' },
    { bankAccountNumber: '123456789012' },
  ])('refuses a body with %j', async (change) => {
    const creator = await creatorWithPayout(null);
    expect((await save(creator.cookie, { ...BODY, ...change })).status).toBe(400);
    expect((await row(creator.user.id)).payoutVpa).toBeNull();
  });

  it('refuses a body without consent or name', async () => {
    const creator = await creatorWithPayout(null);
    expect((await save(creator.cookie, { vpa: VPA, name: 'Raj' })).status).toBe(400);
    expect((await save(creator.cookie, { vpa: VPA, consent: true })).status).toBe(400);
  });

  it('is for creators only: a brand, a user without a role and a signed-out caller are refused', async () => {
    const brand = await brandWithBilling();
    const noRole = await createUserWithSession({ email: 'norole@example.com' });

    expect((await save(brand.cookie)).status).toBe(403);
    expect((await save(brand.cookie)).body.error.code).toBe('WRONG_ROLE');
    expect((await save(noRole.cookie)).body.error.code).toBe('INSTAGRAM_NOT_CONNECTED');
    expect((await save(undefined)).status).toBe(401);
    expect((await row(brand.user.id)).payoutVpa).toBeNull();
  });

  it('is rate limited: 10 saves an hour per creator, then 429 with Retry-After', async () => {
    const creator = await creatorWithPayout(null);
    const other = await creatorWithPayout(null);
    for (let i = 0; i < 10; i++) expect((await save(creator.cookie)).status).toBe(200);

    const limited = await save(creator.cookie);
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect((await save(other.cookie)).status).toBe(200);
  });
});

describe('GET /api/me/payout-upi', () => {
  it('is null before anything is saved, then the masked ID, the name and the consent time', async () => {
    const creator = await creatorWithPayout(null);
    expect((await read(creator.cookie)).body).toEqual({ payoutUpi: null });

    await save(creator.cookie);
    const res = await read(creator.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      payoutUpi: { maskedVpa: MASKED, name: 'Raj Kumar', consentAt: NOW.toISOString() },
    });
    expect(JSON.stringify(res.body)).not.toContain(VPA);
    expect(JSON.stringify(res.body)).not.toContain('raj.creator');
  });

  it('shows a creator only their own details', async () => {
    const a = await creatorWithPayout(null);
    const b = await creatorWithPayout(null);
    await save(a.cookie);
    expect((await read(b.cookie)).body).toEqual({ payoutUpi: null });
  });

  it('is for creators only', async () => {
    const brand = await brandWithBilling();
    expect((await read(brand.cookie)).status).toBe(403);
    expect((await read(undefined)).status).toBe(401);
  });
});

describe('the database CHECK on users.payout_vpa', () => {
  async function setVpa(id: string, vpa: string | null) {
    try {
      await db.update(users).set({ payoutVpa: vpa }).where(eq(users.id, id));
      return null;
    } catch (error) {
      const e = error as { code?: string; cause?: { code?: string; constraint?: string } };
      return e.cause?.code ?? e.code ?? 'unknown';
    }
  }

  it.each(['123456789012', 'ABCPE1234F', 'HDFC0001234', 'no-at-sign', 'a@bank', 'raj@bank1', ''])(
    'refuses %j',
    async (vpa) => {
      const creator = await creatorWithPayout(null);
      expect(await setVpa(creator.user.id, vpa)).toBe('23514');
      expect((await row(creator.user.id)).payoutVpa).toBeNull();
    },
  );

  it('accepts a valid ID and null', async () => {
    const creator = await creatorWithPayout(null);
    expect(await setVpa(creator.user.id, 'raj.kumar-1_x@okhdfcbank')).toBeNull();
    expect(await setVpa(creator.user.id, null)).toBeNull();
  });

  it('is a CHECK constraint in the database, not only in code', async () => {
    const result = await db.execute(
      sql`select conname from pg_constraint where conname = 'users_payout_vpa_check'`,
    );
    expect(result.rows).toHaveLength(1);
  });
});

describe('deleting an account removes the payout details', () => {
  it('DELETE /api/me nulls the UPI ID, the name and the consent time', async () => {
    const creator = await creatorWithPayout('ACTIVE');
    expect((await row(creator.user.id)).payoutVpa).not.toBeNull();

    const res = await api.send('delete', '/api/me', creator.cookie);
    expect(res.status).toBeLessThan(300);
    expect(await row(creator.user.id)).toMatchObject({
      payoutVpa: null,
      payoutName: null,
      payoutVpaConsentAt: null,
    });
  });

  it('the Meta deletion path anonymizes them too', async () => {
    const creator = await creatorWithPayout('ACTIVE');
    await softDeleteAndAnonymizeUser(creator.user.id);
    expect(await row(creator.user.id)).toMatchObject({
      payoutVpa: null,
      payoutName: null,
      payoutVpaConsentAt: null,
    });
  });
});
