import { computeBreakdown, type DealStatus } from '@valueskins/shared';
import type { Express } from 'express';
import request from 'supertest';
import { db } from '../../src/db/client.js';
import { applications, brandBilling, deals, emailLog } from '../../src/db/schema/index.js';
import { createUserWithSession } from './auth.js';
import { buildTestEnv } from '../testEnv.js';

/** 2026-10-09 10:00 IST. Every deal test runs on this clock. */
export const NOW = new Date('2026-10-09T04:30:00Z');

export const DEADLINES = {
  applicationDeadline: '2026-10-12',
  contentUploadDeadline: '2026-10-20',
  dealDeadline: '2026-10-25',
};

export const READY_DRAFT = {
  title: '3 Instagram posts',
  description: 'Content type: 3 posts',
  budgetRupees: 10_000,
  ...DEADLINES,
};

let counter = 0;
const uniqueEmail = (prefix: string) => `${prefix}-${++counter}@example.com`;

const ONBOARDED = () => ({
  roleLockedAt: new Date(),
  onboardingCompletedAt: new Date(),
  profileLockedAt: new Date(),
  adultConfirmedAt: new Date(),
  city: 'Pune',
});

/** A brand that finished onboarding: verified email and billing details. */
export async function brandWithBilling(
  overrides: Parameters<typeof createUserWithSession>[0] = {},
) {
  const session = await createUserWithSession({
    role: 'BRAND',
    email: uniqueEmail('brand'),
    emailVerifiedAt: new Date(),
    ...ONBOARDED(),
    website: 'https://brand.example',
    ...overrides,
  });
  await db.insert(brandBilling).values({
    userId: session.user.id,
    billingName: 'Brand Pvt Ltd',
    billingAddress: '1 Main Road',
    billingState: 'Karnataka',
  });
  return session;
}

/** The UPI ID given to a test creator. Never the payer VPA the Razorpay mock uses. */
export const testVpa = (n: number) => `test.creator${n}@okaxis`;

/**
 * A creator that finished onboarding. `payout` 'ACTIVE' (the default) means they saved a UPI ID,
 * the name on the account and consent (REPLACEMENT_PLAN 2.1); null means they saved nothing.
 */
export async function creatorWithPayout(
  payout: 'ACTIVE' | null = 'ACTIVE',
  overrides: Parameters<typeof createUserWithSession>[0] = {},
) {
  counter += 1;
  return createUserWithSession({
    role: 'CREATOR',
    email: uniqueEmail('creator'),
    emailVerifiedAt: new Date(),
    instagramUserId: `ig-creator-${counter}`,
    igAccountType: 'MEDIA_CREATOR',
    followersCount: 5000,
    engagementRate: '3.50',
    ...ONBOARDED(),
    age: 25,
    ageRecordedAt: new Date(),
    gender: 'FEMALE' as const,
    ...(payout
      ? {
          payoutVpa: testVpa(counter),
          payoutName: `Test Creator ${counter}`,
          payoutVpaConsentAt: new Date(),
        }
      : {}),
    ...overrides,
  });
}

/** The frozen breakdown columns for a ₹10,000 deal at GST 0, as publish writes them. */
export function breakdownColumns() {
  const b = computeBreakdown(10_000_00, 0);
  return {
    budgetPaise: b.budgetPaise,
    commissionBasePaise: b.commissionBasePaise,
    commissionGstPaise: b.commissionGstPaise,
    commissionTotalPaise: b.commissionTotalPaise,
    creatorAmountPaise: b.creatorAmountPaise,
    advancePaise: b.advancePaise,
    finalPaise: b.finalPaise,
  };
}

/** Inserts a deal directly, at any status, with a breakdown from the live GST rate used in tests (0). */
export async function insertDeal(
  brandId: string,
  status: DealStatus = 'OPEN',
  overrides: Partial<typeof deals.$inferInsert> = {},
) {
  counter += 1;
  const money = status === 'DRAFT' ? { budgetPaise: 10_000_00 } : breakdownColumns();
  const [deal] = await db
    .insert(deals)
    .values({
      shortId: `T${String(counter).padStart(7, '0')}`,
      brandId,
      status,
      title: `Deal ${counter}`,
      description: 'Description',
      ...DEADLINES,
      publishedAt: status === 'DRAFT' ? null : NOW,
      ...money,
      ...overrides,
    })
    .returning();
  return deal!;
}

export async function insertApplication(
  dealId: string,
  creatorId: string,
  status: 'APPLIED' | 'CONFIRMED' | 'REJECTED' = 'APPLIED',
) {
  const [row] = await db.insert(applications).values({ dealId, creatorId, status }).returning();
  return row!;
}

export async function sentEmails(template?: string) {
  const rows = await db.select().from(emailLog);
  return template ? rows.filter((row) => row.template === template) : rows;
}

/** supertest wrapper that sets the Origin header mutating requests need and the session cookie. */
export function http(app: Express) {
  const origin = buildTestEnv().WEB_ORIGIN;
  return {
    get: (path: string, cookie?: string) => {
      const req = request(app).get(path);
      return cookie ? req.set('Cookie', cookie) : req;
    },
    send: (method: 'post' | 'patch' | 'delete', path: string, cookie?: string, body?: object) => {
      const req = request(app)[method](path).set('Origin', origin);
      const withCookie = cookie ? req.set('Cookie', cookie) : req;
      return body === undefined ? withCookie : withCookie.send(body);
    },
  };
}
