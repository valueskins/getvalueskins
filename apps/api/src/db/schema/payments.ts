import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
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
  directPaymentStageEnum,
  invoiceKindEnum,
  paymentStatusEnum,
  paymentTypeEnum,
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
    // Razorpay's fee and tax on this payment, from its payment entity. ValueSkins absorbs them
    // (SPEC 4.3) and shows them in the deal report (SPEC 17). Null when not recorded.
    razorpayFeePaise: bigint('razorpay_fee_paise', { mode: 'number' }),
    razorpayTaxPaise: bigint('razorpay_tax_paise', { mode: 'number' }),
    ...timestamps,
  },
  (t) => [
    index('payments_deal_id_idx').on(t.dealId),
    index('payments_status_idx').on(t.status),
    uniqueIndex('payments_one_captured_per_deal_type_idx')
      .on(t.dealId, t.type)
      .where(sql`${t.status} = 'CAPTURED'`),
    // SPEC 7.3: one open Order per deal per payment type. A failed attempt keeps its order
    // (Checkout retries on it), so FAILED counts as open and the row is reused.
    uniqueIndex('payments_one_open_per_deal_type_idx')
      .on(t.dealId, t.type)
      .where(sql`${t.status} in ('CREATED', 'FAILED')`),
  ],
);

/**
 * A direct brand-to-creator UPI payment for the advance or the final (REPLACEMENT_PLAN 2.1).
 * The brand records the UPI reference; only the confirmed creator's "received" moves the deal.
 * A confirmed or disputed row is never edited or deleted: a correction is a new row.
 * `paid_to_vpa` is the UPI ID the brand was shown; it is never returned in full.
 */
export const directPayments = pgTable(
  'direct_payments',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'restrict' }),
    stage: directPaymentStageEnum('stage').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    reference: varchar('reference', { length: 40 }).notNull(),
    paidToVpa: text('paid_to_vpa').notNull(),
    note: text('note'),
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'restrict' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }),
    disputedAt: timestamp('disputed_at', { withTimezone: true, mode: 'date' }),
    disputeReason: text('dispute_reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('direct_payments_deal_id_idx').on(t.dealId),
    index('direct_payments_recorded_by_idx').on(t.recordedBy),
    index('direct_payments_confirmed_by_idx').on(t.confirmedBy),
    // One live record per deal and stage: a confirmed one counts, a disputed one does not.
    uniqueIndex('direct_payments_one_live_per_stage_idx')
      .on(t.dealId, t.stage)
      .where(sql`${t.disputedAt} is null`),
    check(
      'direct_payments_not_confirmed_and_disputed_check',
      sql`${t.confirmedAt} is null or ${t.disputedAt} is null`,
    ),
    check(
      'direct_payments_confirmed_by_check',
      sql`(${t.confirmedBy} is null) = (${t.confirmedAt} is null)`,
    ),
    check(
      'direct_payments_dispute_reason_check',
      sql`(${t.disputeReason} is null) = (${t.disputedAt} is null)`,
    ),
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
    // The commission invoice belongs to a Razorpay payment, a payment record to a direct payment.
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'restrict' }),
    directPaymentId: uuid('direct_payment_id').references(() => directPayments.id, {
      onDelete: 'restrict',
    }),
    kind: invoiceKindEnum('kind').notNull(),
    number: varchar('number', { length: 32 }).notNull().unique(),
    financialYear: varchar('financial_year', { length: 7 }).notNull(),
    sequence: integer('sequence').notNull(),
    snapshot: jsonb('snapshot').notNull().$type<Record<string, unknown>>(),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('invoices_deal_id_idx').on(t.dealId),
    // One invoice per payment, one payment record per direct payment (SPEC 7.4).
    uniqueIndex('invoices_payment_id_unique_idx').on(t.paymentId),
    uniqueIndex('invoices_direct_payment_id_unique_idx').on(t.directPaymentId),
    index('invoices_financial_year_idx').on(t.financialYear),
    check(
      'invoices_one_source_check',
      sql`(${t.paymentId} is not null) <> (${t.directPaymentId} is not null)`,
    ),
    check(
      'invoices_kind_source_check',
      sql`(${t.kind} = 'COMMISSION_TAX_INVOICE') = (${t.paymentId} is not null)`,
    ),
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
