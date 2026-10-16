import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { users } from './users.js';
import {
  applicationStatusEnum,
  cancelledByRoleEnum,
  dealEventActorTypeEnum,
  dealStatusEnum,
} from './enums.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const deals = pgTable(
  'deals',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    shortId: varchar('short_id', { length: 8 }).notNull().unique(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    creatorId: uuid('creator_id').references(() => users.id, { onDelete: 'restrict' }),
    // Nullable while DRAFT (a half-filled form is saved as it is); the CHECK below
    // makes them required from OPEN onward.
    title: varchar('title', { length: 255 }),
    description: text('description'),
    budgetPaise: bigint('budget_paise', { mode: 'number' }),
    commissionBasePaise: bigint('commission_base_paise', { mode: 'number' }),
    commissionGstPaise: bigint('commission_gst_paise', { mode: 'number' }),
    commissionTotalPaise: bigint('commission_total_paise', { mode: 'number' }),
    creatorAmountPaise: bigint('creator_amount_paise', { mode: 'number' }),
    advancePaise: bigint('advance_paise', { mode: 'number' }),
    finalPaise: bigint('final_paise', { mode: 'number' }),
    applicationDeadline: date('application_deadline'),
    contentUploadDeadline: date('content_upload_deadline'),
    dealDeadline: date('deal_deadline'),
    status: dealStatusEnum('status').notNull().default('DRAFT'),
    contentLink: text('content_link'),
    contentUploadedAt: timestamp('content_uploaded_at', { withTimezone: true, mode: 'date' }),
    uploadCount: integer('upload_count').notNull().default(0),
    feedback: text('feedback'),
    revisionCount: integer('revision_count').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }),
    commissionPaidAt: timestamp('commission_paid_at', { withTimezone: true, mode: 'date' }),
    advancePaidAt: timestamp('advance_paid_at', { withTimezone: true, mode: 'date' }),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    cancelledById: uuid('cancelled_by_id').references(() => users.id, { onDelete: 'set null' }),
    cancelledByRole: cancelledByRoleEnum('cancelled_by_role'),
    cancellationReason: text('cancellation_reason'),
    ...timestamps,
  },
  (t) => [
    // Keyset pagination per owner and per status (SPEC 15): the filter column, then id descending.
    index('deals_brand_id_id_idx').on(t.brandId, t.id.desc()),
    index('deals_creator_id_id_idx').on(t.creatorId, t.id.desc()),
    index('deals_cancelled_by_id_idx').on(t.cancelledById),
    index('deals_status_id_idx').on(t.status, t.id.desc()),
    // The creators feed: open deals, newest published first (published_at, then id).
    index('deals_open_feed_idx')
      .on(t.publishedAt.desc(), t.id.desc())
      .where(sql`${t.status} = 'OPEN'`),
    // The admin search by short id prefix (LIKE 'AB1%') cannot use the unique index.
    index('deals_short_id_prefix_idx').on(t.shortId.op('varchar_pattern_ops')),
    index('deals_application_deadline_idx').on(t.applicationDeadline),
    index('deals_content_upload_deadline_idx').on(t.contentUploadDeadline),
    index('deals_deal_deadline_idx').on(t.dealDeadline),
    check(
      'deals_published_fields_check',
      sql`${t.status} = 'DRAFT' or (
        ${t.title} is not null and ${t.description} is not null
        and ${t.applicationDeadline} is not null and ${t.contentUploadDeadline} is not null
        and ${t.dealDeadline} is not null and ${t.budgetPaise} is not null
        and ${t.commissionBasePaise} is not null and ${t.commissionGstPaise} is not null
        and ${t.commissionTotalPaise} is not null and ${t.creatorAmountPaise} is not null
        and ${t.advancePaise} is not null and ${t.finalPaise} is not null
      )`,
    ),
  ],
);

export const contentUploads = pgTable(
  'content_uploads',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    link: text('link').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [index('content_uploads_deal_id_idx').on(t.dealId)],
);

export const applications = pgTable(
  'applications',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: applicationStatusEnum('status').notNull().default('APPLIED'),
    ...timestamps,
  },
  (t) => [
    unique('applications_deal_id_creator_id_unique').on(t.dealId, t.creatorId),
    index('applications_creator_id_idx').on(t.creatorId),
    index('applications_status_idx').on(t.status),
  ],
);

export const dealEvents = pgTable(
  'deal_events',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    fromStatus: dealStatusEnum('from_status').notNull(),
    toStatus: dealStatusEnum('to_status').notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorType: dealEventActorTypeEnum('actor_type').notNull(),
    note: text('note'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('deal_events_deal_id_idx').on(t.dealId),
    index('deal_events_actor_id_idx').on(t.actorId),
  ],
);
