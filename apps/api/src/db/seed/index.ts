import { sql } from 'drizzle-orm';
import { db } from '../client.js';
import { brandBilling, users } from '../schema/index.js';
import { BRAND_FIXTURES, CREATOR_FIXTURES } from './fixtures.js';
import type { CompanyDetails } from '../../invoices/snapshot.js';
import { insertDealAtCheckpoint, SEED_DEAL_STATUSES } from './dealMatrix.js';

/** Seller details for the seeded invoices when the caller gives none (the CLI passes the real ones from env). */
export const DEFAULT_SEED_COMPANY: CompanyDetails = {
  legalName: 'Valueskins Private Limited',
  address: '123 MG Road, Bengaluru',
  state: 'Karnataka',
  gstin: '29AAAAA0000A1Z5',
  sacCode: '998311',
};

const TABLES_IN_DELETE_ORDER = [
  'deal_events',
  'email_log',
  'disputes',
  'invoices',
  'invoice_counters',
  'direct_payments',
  'payments',
  'content_uploads',
  'applications',
  'deals',
  'sessions',
  'email_verification_tokens',
  'brand_billing',
  'meta_deletion_requests',
  'webhook_events',
  'users',
];

async function truncateAll(): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES_IN_DELETE_ORDER.join(', ')} CASCADE`));
}

const IG_TOKEN_PLACEHOLDER = 'seed-encrypted-token';
const IG_TOKEN_EXPIRES_AT = new Date('2027-01-01T00:00:00.000Z');

export interface SeedOptions {
  company?: CompanyDetails;
}

export async function seed(options: SeedOptions = {}): Promise<void> {
  await truncateAll();

  const brandIds: string[] = [];
  for (const brand of BRAND_FIXTURES) {
    const [row] = await db
      .insert(users)
      .values({
        instagramUserId: brand.instagramUserId,
        username: brand.username,
        name: brand.name,
        igAccountType: 'BUSINESS',
        role: 'BRAND',
        roleLockedAt: new Date(),
        igTokenEncrypted: IG_TOKEN_PLACEHOLDER,
        igTokenExpiresAt: IG_TOKEN_EXPIRES_AT,
        email: `${brand.username}@example.com`,
        emailVerifiedAt: new Date(),
        onboardingCompletedAt: new Date(),
      })
      .returning();
    if (!row) throw new Error(`failed to insert brand ${brand.username}`);

    await db.insert(brandBilling).values({
      userId: row.id,
      billingName: brand.billingName,
      billingAddress: brand.billingAddress,
      billingState: brand.billingState,
      gstin: brand.gstin,
    });

    brandIds.push(row.id);
  }

  const creatorIds: string[] = [];
  for (const creator of CREATOR_FIXTURES) {
    const [row] = await db
      .insert(users)
      .values({
        instagramUserId: creator.instagramUserId,
        username: creator.username,
        name: creator.name,
        igAccountType: 'MEDIA_CREATOR',
        role: 'CREATOR',
        roleLockedAt: new Date(),
        igTokenEncrypted: IG_TOKEN_PLACEHOLDER,
        igTokenExpiresAt: IG_TOKEN_EXPIRES_AT,
        email: `${creator.username}@example.com`,
        emailVerifiedAt: new Date(),
        onboardingCompletedAt: new Date(),
        payoutVpa: creator.payout?.vpa ?? null,
        payoutName: creator.payout?.name ?? null,
        payoutVpaConsentAt: creator.payout ? new Date() : null,
      })
      .returning();
    if (!row) throw new Error(`failed to insert creator ${creator.username}`);

    creatorIds.push(row.id);
  }

  const activeCreatorIds = creatorIds.slice(0, 3);
  const activeCreatorVpas = CREATOR_FIXTURES.slice(0, 3).map((c) => c.payout?.vpa ?? '');
  const applicantCreatorId = creatorIds[3];
  if (!applicantCreatorId) throw new Error('expected a 4th creator with no UPI details');

  for (const [index, status] of SEED_DEAL_STATUSES.entries()) {
    const brandId = brandIds[index % brandIds.length];
    const confirmedCreatorId = activeCreatorIds[index % activeCreatorIds.length];
    const confirmedCreatorVpa = activeCreatorVpas[index % activeCreatorIds.length];
    if (!brandId || !confirmedCreatorId || !confirmedCreatorVpa)
      throw new Error('brand/creator fixtures missing');

    await insertDealAtCheckpoint(db, {
      status,
      index,
      brandId,
      confirmedCreatorId,
      confirmedCreatorVpa,
      applicantCreatorId,
      budgetRupees: 10_000,
      applicationDeadline: '2026-11-01',
      contentUploadDeadline: '2026-11-10',
      dealDeadline: '2026-11-20',
      company: options.company ?? DEFAULT_SEED_COMPANY,
    });
  }
}
