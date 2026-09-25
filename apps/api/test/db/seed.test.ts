import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../../src/db/seed/index.js';
import { applications, deals, payments, transfers, users } from '../../src/db/schema/index.js';
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
    expect((await db.select().from(payments)).length).toBe(12);
    expect((await db.select().from(transfers)).length).toBe(6);
  });

  it('is safe to run twice in a row', async () => {
    await seed();
    await seed();

    expect((await db.select().from(deals)).length).toBe(10);
  });
});
