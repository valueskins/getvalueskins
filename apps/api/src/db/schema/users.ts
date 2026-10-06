import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { payoutAccountStatusEnum, userRoleEnum } from './enums.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    // Nullable: V0 allows email-only accounts before Instagram login (V0_LAUNCH 2.1).
    instagramUserId: varchar('instagram_user_id', { length: 64 }).unique(),
    username: varchar('username', { length: 255 }).notNull(),
    // Set when an email-only account types its (unverified) Instagram username
    // during onboarding (V0_LAUNCH 2.2).
    instagramUsernameSetAt: timestamp('instagram_username_set_at', {
      withTimezone: true,
      mode: 'date',
    }),
    name: varchar('name', { length: 255 }).notNull(),
    // Nullable: an email-only account (created via email-code login) has no
    // Instagram data at all until it links an Instagram account (V0_LAUNCH 2.1).
    igAccountType: varchar('ig_account_type', { length: 32 }),
    role: userRoleEnum('role'),
    roleLockedAt: timestamp('role_locked_at', { withTimezone: true, mode: 'date' }),
    followersCount: integer('followers_count'),
    followsCount: integer('follows_count'),
    mediaCount: integer('media_count'),
    engagementRate: numeric('engagement_rate', { precision: 5, scale: 2 }),
    bio: text('bio'),
    profilePictureUrl: text('profile_picture_url'),
    igTokenEncrypted: text('ig_token_encrypted'),
    igTokenExpiresAt: timestamp('ig_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    instagramSyncedAt: timestamp('instagram_synced_at', { withTimezone: true, mode: 'date' }),
    email: varchar('email', { length: 320 }).unique(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
    isAdmin: boolean('is_admin').notNull().default(false),
    onboardingCompletedAt: timestamp('onboarding_completed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    index('users_role_idx').on(t.role),
    index('users_deleted_at_idx').on(t.deletedAt),
    // username is only guaranteed unique among Instagram-linked accounts; a future
    // email-only login may auto-derive usernames that collide (V0_LAUNCH 2.1).
    uniqueIndex('users_username_unique_idx')
      .on(t.username)
      .where(sql`${t.instagramUserId} is not null`),
  ],
);

export const brandBilling = pgTable('brand_billing', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  billingName: varchar('billing_name', { length: 255 }).notNull(),
  billingAddress: text('billing_address').notNull(),
  billingState: varchar('billing_state', { length: 100 }).notNull(),
  gstin: varchar('gstin', { length: 15 }),
  ...timestamps,
});

export const creatorPayoutAccounts = pgTable(
  'creator_payout_accounts',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    razorpayAccountId: varchar('razorpay_account_id', { length: 255 }).notNull().unique(),
    // Nullable: the row is written as soon as the linked account exists, so an
    // interrupted setup resumes instead of creating duplicates (SPEC 7.2).
    razorpayStakeholderId: varchar('razorpay_stakeholder_id', { length: 255 }),
    razorpayProductId: varchar('razorpay_product_id', { length: 255 }),
    status: payoutAccountStatusEnum('status').notNull(),
    bankLast4: varchar('bank_last4', { length: 4 }),
    ifsc: varchar('ifsc', { length: 11 }),
    requirements: jsonb('requirements').$type<Record<string, unknown>>(),
    consentAt: timestamp('consent_at', { withTimezone: true, mode: 'date' }),
    // When `status` was last confirmed by Razorpay (a webhook's created_at, or
    // a refresh). A webhook older than this is stale and ignored.
    statusSyncedAt: timestamp('status_synced_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [index('creator_payout_accounts_status_idx').on(t.status)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    ip: varchar('ip', { length: 64 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 320 }).notNull(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('email_verification_tokens_user_id_idx').on(t.userId),
    index('email_verification_tokens_expires_at_idx').on(t.expiresAt),
  ],
);

/**
 * Backs a future email-code login path (V0_LAUNCH 2.1, gated by AUTH_EMAIL_ENABLED).
 * No user_id FK: a code can be requested before any user row exists.
 */
export const emailLoginCodes = pgTable(
  'email_login_codes',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    email: varchar('email', { length: 320 }).notNull(),
    codeHash: varchar('code_hash', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('email_login_codes_email_idx').on(t.email)],
);
