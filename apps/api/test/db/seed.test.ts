import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../../src/db/seed/index.js';
import { applications, deals, directPayments, payments, users } from '../../src/db/schema/index.js';
import { closeDb, db, resetDb, truncateAll } from './testDb.js';

beforeAll(async () => {
  await resetDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe('db:seed', () => {
  it('creates the expected fixed row counts', async () => {
    await seed();

    expect((await db.select().from(users)).length).toBe(6);
    expect((await db.select().from(deals)).length).toBe(10);
    expect((await db.select().from(applications)).length).toBe(9);
    expect((await db.select().from(payments)).length).toBe(6);
    // Six confirmed direct payments, and one earlier attempt the creator said did not arrive.
    expect((await db.select().from(directPayments)).length).toBe(7);
  });

  it('gives creators one to three a UPI ID, a name and consent, and creator four nothing', async () => {
    await seed();

    const creators = (await db.select().from(users).where(eq(users.role, 'CREATOR'))).sort((a, b) =>
      a.username.localeCompare(b.username),
    );
    expect(creators.map((c) => c.username)).toEqual([
      'creator_four',
      'creator_one',
      'creator_three',
      'creator_two',
    ]);
    const withDetails = creators.filter((c) => c.username !== 'creator_four');
    for (const creator of withDetails) {
      expect(creator.payoutVpa).toMatch(/^seedcreator\d@okaxis$/);
      expect(creator.payoutName).toBeTruthy();
      expect(creator.payoutVpaConsentAt).not.toBeNull();
    }
    const four = creators.find((c) => c.username === 'creator_four');
    expect(four).toMatchObject({ payoutVpa: null, payoutName: null, payoutVpaConsentAt: null });
  });

  it('is safe to run twice in a row', async () => {
    await seed();
    await seed();

    expect((await db.select().from(deals)).length).toBe(10);
  });
});
