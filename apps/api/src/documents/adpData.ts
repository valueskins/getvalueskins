import {
  invoiceSnapshotSchema,
  type CommissionSnapshot,
  type DirectPaymentView,
  type PaymentRecordSnapshot,
} from '@valueskins/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  brandBilling,
  contentUploads,
  dealEvents,
  deals,
  invoices,
  payments,
  users,
} from '../db/schema/index.js';
import { notFound } from '../deals/access.js';
import type { Deal } from '../deals/stateMachine.js';
import { listDirectPaymentRows, toDirectPaymentView } from '../directPayments/view.js';

export interface AdpParty {
  username: string;
  name: string;
  instagramUserId: string | null;
  deleted: boolean;
}

/** Everything the deal report (SPEC 17) is built from. */
export interface AdpData {
  deal: Deal;
  brand: AdpParty;
  brandBilling: { billingName: string; gstin: string | null } | null;
  creator: AdpParty | null;
  /** In the order commission invoice, advance payment record, final payment record. */
  invoices: {
    commission: CommissionSnapshot | null;
    advance: PaymentRecordSnapshot | null;
    final: PaymentRecordSnapshot | null;
  };
  uploads: Array<{ link: string; uploadedAt: Date }>;
  feedbacks: Array<{ text: string; at: Date }>;
  /** Every direct payment record, disputed and awaiting ones included, oldest first. */
  directPayments: DirectPaymentView[];
  payments: Array<{
    type: string;
    razorpayPaymentId: string | null;
    amountPaise: number;
    feePaise: number | null;
    taxPaise: number | null;
  }>;
  events: Array<{
    from: string;
    to: string;
    actor: string;
    note: string | null;
    at: Date;
  }>;
}

function party(row: typeof users.$inferSelect | undefined): AdpParty | null {
  if (!row) return null;
  return {
    username: row.deletedAt ? 'Deleted user' : row.username,
    name: row.deletedAt ? 'Deleted user' : row.name,
    instagramUserId: row.deletedAt ? null : row.instagramUserId,
    deleted: row.deletedAt !== null,
  };
}

/** Loads the deal report's data from the database. Missing parts come back empty, never as errors. */
export async function loadAdpData(dealId: string): Promise<AdpData> {
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
  if (!deal) throw notFound();

  const userIds = deal.creatorId ? [deal.brandId, deal.creatorId] : [deal.brandId];
  const userRows = await db.select().from(users).where(inArray(users.id, userIds));
  const byId = new Map(userRows.map((u) => [u.id, u]));
  const brand = party(byId.get(deal.brandId));
  if (!brand) throw new Error(`deal ${deal.shortId} has no brand`);
  const creator = deal.creatorId ? party(byId.get(deal.creatorId)) : null;

  const [billing] = await db
    .select()
    .from(brandBilling)
    .where(eq(brandBilling.userId, deal.brandId))
    .limit(1);

  const invoiceRows = await db.select().from(invoices).where(eq(invoices.dealId, dealId));
  const snapshotOf = <
    K extends 'COMMISSION_TAX_INVOICE' | 'ADVANCE_PAYMENT_RECORD' | 'FINAL_PAYMENT_RECORD',
  >(
    kind: K,
  ) => {
    const row = invoiceRows.find((r) => r.kind === kind);
    if (!row) return null;
    const snapshot = invoiceSnapshotSchema.parse(row.snapshot);
    return snapshot as Extract<typeof snapshot, { kind: K }>;
  };

  const uploads = await db
    .select({ link: contentUploads.link, uploadedAt: contentUploads.uploadedAt })
    .from(contentUploads)
    .where(eq(contentUploads.dealId, dealId))
    .orderBy(asc(contentUploads.uploadedAt), asc(contentUploads.id));

  const eventRows = await db
    .select({ event: dealEvents, actorUsername: users.username, actorDeleted: users.deletedAt })
    .from(dealEvents)
    .leftJoin(users, eq(users.id, dealEvents.actorId))
    .where(eq(dealEvents.dealId, dealId))
    .orderBy(asc(dealEvents.createdAt), asc(dealEvents.id));

  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.dealId, dealId))
    .orderBy(asc(payments.createdAt));
  const directPaymentRows = await listDirectPaymentRows(dealId);

  return {
    deal,
    brand,
    brandBilling: billing ? { billingName: billing.billingName, gstin: billing.gstin } : null,
    creator,
    invoices: {
      commission: snapshotOf('COMMISSION_TAX_INVOICE'),
      advance: snapshotOf('ADVANCE_PAYMENT_RECORD'),
      final: snapshotOf('FINAL_PAYMENT_RECORD'),
    },
    uploads,
    // Each revision request stores the feedback text as the event note (the deal row keeps only the latest).
    feedbacks: eventRows
      .filter((r) => r.event.toStatus === 'REVISION_REQUESTED' && r.event.note)
      .map((r) => ({ text: r.event.note as string, at: r.event.createdAt })),
    directPayments: directPaymentRows.map(toDirectPaymentView),
    payments: paymentRows
      .filter((p) => p.status === 'CAPTURED')
      .map((p) => ({
        type: p.type,
        razorpayPaymentId: p.razorpayPaymentId,
        amountPaise: p.amountPaise,
        feePaise: p.razorpayFeePaise,
        taxPaise: p.razorpayTaxPaise,
      })),
    events: eventRows.map((r) => ({
      from: r.event.fromStatus,
      to: r.event.toStatus,
      actor:
        r.event.actorType === 'SYSTEM'
          ? 'System'
          : r.actorUsername
            ? r.actorDeleted
              ? 'Deleted user'
              : `@${r.actorUsername}`
            : r.event.actorType === 'ADMIN'
              ? 'Admin'
              : 'Unknown',
      note: r.event.note,
      at: r.event.createdAt,
    })),
  };
}
