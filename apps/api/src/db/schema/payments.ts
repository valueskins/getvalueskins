import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { deals } from './deals.js';
import { users } from './users.js';
import {
  invoiceKindEnum,
  paymentStatusEnum,
  paymentTypeEnum,
  transferStatusEnum,
  transferTypeEnum,
} from './enums.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const payments = pgTable(
  'payments',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'restrict' }),
    type: paymentTypeEnum('type').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    razorpayOrderId: varchar('razorpay_order_id', { length: 255 }).notNull().unique(),
    razorpayPaymentId: varchar('razorpay_payment_id', { length: 255 }).unique(),
    status: paymentStatusEnum('status').notNull().default('CREATED'),
    failureReason: text('failure_reason'),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    index('payments_deal_id_idx').on(t.dealId),
    index('payments_status_idx').on(t.status),
    uniqueIndex('payments_one_captured_per_deal_type_idx')
      .on(t.dealId, t.type)
      .where(sql`${t.status} = 'CAPTURED'`),
  ],
);

export const transfers = pgTable(
  'transfers',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'restrict' }),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: transferTypeEnum('type').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    razorpayTransferId: varchar('razorpay_transfer_id', { length: 255 }).unique(),
    status: transferStatusEnum('status').notNull().default('PENDING'),
    failureReason: text('failure_reason'),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    index('transfers_deal_id_idx').on(t.dealId),
    index('transfers_payment_id_idx').on(t.paymentId),
    index('transfers_creator_id_idx').on(t.creatorId),
    index('transfers_status_idx').on(t.status),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'restrict' }),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    kind: invoiceKindEnum('kind').notNull(),
    number: varchar('number', { length: 32 }).notNull().unique(),
    financialYear: varchar('financial_year', { length: 7 }).notNull(),
    sequence: integer('sequence').notNull(),
    snapshot: jsonb('snapshot').notNull().$type<Record<string, unknown>>(),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('invoices_deal_id_idx').on(t.dealId),
    index('invoices_payment_id_idx').on(t.paymentId),
    index('invoices_financial_year_idx').on(t.financialYear),
  ],
);

export const invoiceCounters = pgTable(
  'invoice_counters',
  {
    kind: invoiceKindEnum('kind').notNull(),
    financialYear: varchar('financial_year', { length: 7 }).notNull(),
    lastSequence: integer('last_sequence').notNull().default(0),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.kind, t.financialYear] })],
);
