import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applications, deals, payments, users } from '../../src/db/schema/index.js';
import { closeDb, db, resetDb, truncateAll } from './testDb.js';

async function insertFixtureDeal(): Promise<{ dealId: string; creatorId: string }> {
  const [brand] = await db
    .insert(users)
    .values({
      instagramUserId: 'ig_fixture_brand',
      username: 'fixture_brand',
      name: 'Fixture Brand',
      igAccountType: 'BUSINESS',
      igTokenEncrypted: 'x',
      igTokenExpiresAt: new Date('2027-01-01'),
    })
    .returning();
  const [creator] = await db
    .insert(users)
    .values({
      instagramUserId: 'ig_fixture_creator',
      username: 'fixture_creator',
      name: 'Fixture Creator',
      igAccountType: 'MEDIA_CREATOR',
      igTokenEncrypted: 'x',
      igTokenExpiresAt: new Date('2027-01-01'),
    })
    .returning();
  if (!brand || !creator) throw new Error('failed to insert fixture users');

  const [deal] = await db
    .insert(deals)
    .values({
      shortId: 'FIXTURE1',
      brandId: brand.id,
      title: 'Fixture deal',
      description: 'Fixture deal for unique-constraint tests',
      applicationDeadline: '2026-11-01',
      contentUploadDeadline: '2026-11-10',
      dealDeadline: '2026-11-20',
    })
    .returning();
  if (!deal) throw new Error('failed to insert fixture deal');

  return { dealId: deal.id, creatorId: creator.id };
}

beforeAll(async () => {
  await resetDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe('applications unique (deal_id, creator_id)', () => {
  it('rejects a second application from the same creator on the same deal', async () => {
    const { dealId, creatorId } = await insertFixtureDeal();

    await db.insert(applications).values({ dealId, creatorId, status: 'APPLIED' });

    await expect(
      db.insert(applications).values({ dealId, creatorId, status: 'APPLIED' }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });
});

describe('payments partial unique index: one CAPTURED per (deal_id, type)', () => {
  it('rejects a second CAPTURED payment of the same type for the same deal', async () => {
    const { dealId } = await insertFixtureDeal();

    await db.insert(payments).values({
      dealId,
      type: 'COMMISSION',
      amountPaise: 88_500,
      razorpayOrderId: 'order_unique_test_1',
      status: 'CAPTURED',
    });

    await expect(
      db.insert(payments).values({
        dealId,
        type: 'COMMISSION',
        amountPaise: 88_500,
        razorpayOrderId: 'order_unique_test_2',
        status: 'CAPTURED',
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('allows a CAPTURED payment next to one open payment of the same type (the indexes are partial)', async () => {
    const { dealId } = await insertFixtureDeal();

    await db.insert(payments).values({
      dealId,
      type: 'COMMISSION',
      amountPaise: 88_500,
      razorpayOrderId: 'order_unique_test_3',
      razorpayPaymentId: 'pay_unique_test_3',
      status: 'CAPTURED',
    });

    await expect(
      db.insert(payments).values({
        dealId,
        type: 'COMMISSION',
        amountPaise: 88_500,
        razorpayOrderId: 'order_unique_test_4',
        status: 'FAILED',
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a second open (CREATED or FAILED) payment of the same type: one open order per deal (SPEC 7.3)', async () => {
    const { dealId } = await insertFixtureDeal();

    await db.insert(payments).values({
      dealId,
      type: 'COMMISSION',
      amountPaise: 88_500,
      razorpayOrderId: 'order_unique_test_5',
      status: 'FAILED',
    });

    await expect(
      db.insert(payments).values({
        dealId,
        type: 'COMMISSION',
        amountPaise: 88_500,
        razorpayOrderId: 'order_unique_test_6',
        status: 'CREATED',
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });

    // A different payment type on the same deal is independent.
    await expect(
      db.insert(payments).values({
        dealId,
        type: 'ADVANCE',
        amountPaise: 277_500,
        razorpayOrderId: 'order_unique_test_7',
        status: 'CREATED',
      }),
    ).resolves.toBeDefined();
  });
});

describe('users partial unique index on username (WHERE instagram_user_id IS NOT NULL)', () => {
  it('rejects a second Instagram-linked user with the same username', async () => {
    await db.insert(users).values({
      instagramUserId: 'ig_dup_1',
      username: 'duplicate_handle',
      name: 'First',
      igAccountType: 'BUSINESS',
      igTokenEncrypted: 'x',
      igTokenExpiresAt: new Date('2027-01-01'),
    });

    await expect(
      db.insert(users).values({
        instagramUserId: 'ig_dup_2',
        username: 'duplicate_handle',
        name: 'Second',
        igAccountType: 'BUSINESS',
        igTokenEncrypted: 'x',
        igTokenExpiresAt: new Date('2027-01-01'),
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('allows the same username across two email-only users (the index is partial)', async () => {
    await db.insert(users).values({
      instagramUserId: null,
      username: 'shared_email_handle',
      name: 'Email User One',
      igAccountType: 'BUSINESS',
      igTokenEncrypted: 'x',
      igTokenExpiresAt: new Date('2027-01-01'),
    });

    await expect(
      db.insert(users).values({
        instagramUserId: null,
        username: 'shared_email_handle',
        name: 'Email User Two',
        igAccountType: 'BUSINESS',
        igTokenEncrypted: 'x',
        igTokenExpiresAt: new Date('2027-01-01'),
      }),
    ).resolves.toBeDefined();
  });
});
