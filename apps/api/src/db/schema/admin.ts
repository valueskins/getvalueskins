import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { deals } from './deals.js';
import { users } from './users.js';
import { disputeStatusEnum, emailLogStatusEnum } from './enums.js';

export const emailLog = pgTable(
  'email_log',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    toEmail: varchar('to_email', { length: 320 }).notNull(),
    cc: jsonb('cc').$type<string[]>(),
    template: varchar('template', { length: 128 }).notNull(),
    subject: varchar('subject', { length: 255 }).notNull(),
    bodyText: text('body_text').notNull(),
    attachmentNames: jsonb('attachment_names').$type<string[]>(),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    status: emailLogStatusEnum('status').notNull().default('QUEUED'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    index('email_log_deal_id_idx').on(t.dealId),
    index('email_log_user_id_idx').on(t.userId),
    index('email_log_status_idx').on(t.status),
    index('email_log_provider_message_id_idx').on(t.providerMessageId),
  ],
);

export const disputes = pgTable(
  'disputes',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'restrict' }),
    raisedById: uuid('raised_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    subject: varchar('subject', { length: 255 }).notNull(),
    description: text('description').notNull(),
    status: disputeStatusEnum('status').notNull().default('OPEN'),
    resolution: text('resolution'),
    refundReference: varchar('refund_reference', { length: 255 }),
    resolvedById: uuid('resolved_by_id').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('disputes_deal_id_idx').on(t.dealId),
    index('disputes_raised_by_id_idx').on(t.raisedById),
    index('disputes_resolved_by_id_idx').on(t.resolvedById),
    index('disputes_status_idx').on(t.status),
    // One open dispute per deal (SPEC 12): two raised at the same moment cannot both succeed.
    uniqueIndex('disputes_one_open_per_deal_idx')
      .on(t.dealId)
      .where(sql`${t.status} = 'OPEN'`),
  ],
);

/**
 * PK is Razorpay's own event id, not a generated uuid: this table's whole
 * purpose is deduplicating webhook deliveries by that id (CLAUDE.md rule 3).
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    eventType: varchar('event_type', { length: 128 }).notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    error: text('error'),
  },
  (t) => [
    index('webhook_events_event_type_idx').on(t.eventType),
    index('webhook_events_processed_at_idx').on(t.processedAt),
  ],
);

export const metaDeletionRequests = pgTable(
  'meta_deletion_requests',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    instagramUserId: varchar('instagram_user_id', { length: 64 }).notNull(),
    confirmationCode: varchar('confirmation_code', { length: 64 }).notNull().unique(),
    status: varchar('status', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    index('meta_deletion_requests_instagram_user_id_idx').on(t.instagramUserId),
    index('meta_deletion_requests_status_idx').on(t.status),
  ],
);
