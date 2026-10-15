import { invoiceSnapshotSchema, type DocumentKind, type InvoiceKind } from '@valueskins/shared';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deals, invoices } from '../db/schema/index.js';
import { AppError } from '../errors/AppError.js';
import { adpBlocks } from './adpBlocks.js';
import { loadAdpData } from './adpData.js';
import { invoiceBlocks, invoiceFilename } from './invoiceBlocks.js';
import { renderPdf } from './render.js';

export interface RenderedDocument {
  filename: string;
  content: Buffer;
}

const KIND_BY_PARAM: Record<Exclude<DocumentKind, 'adp'>, InvoiceKind> = {
  'commission-invoice': 'COMMISSION_TAX_INVOICE',
  'advance-payment-record': 'ADVANCE_PAYMENT_RECORD',
  'final-payment-record': 'FINAL_PAYMENT_RECORD',
};

function notAvailable(): AppError {
  return new AppError('DOCUMENT_NOT_AVAILABLE', 409, 'This document is not available yet');
}

async function renderInvoiceRow(row: typeof invoices.$inferSelect): Promise<RenderedDocument> {
  const snapshot = invoiceSnapshotSchema.parse(row.snapshot);
  const content = await renderPdf(invoiceBlocks(snapshot), {
    title: `${snapshot.title} ${snapshot.number}`,
    createdAt: new Date(snapshot.issuedAt),
  });
  return { filename: invoiceFilename(snapshot), content };
}

/** The payment record of one confirmed direct payment, from its stored snapshot. Null if none was issued. */
export async function renderRecordForDirectPayment(
  directPaymentId: string,
): Promise<RenderedDocument | null> {
  const [row] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.directPaymentId, directPaymentId))
    .limit(1);
  return row ? renderInvoiceRow(row) : null;
}

/** The ValueSkins fee invoice for one payment, rendered from its stored snapshot. Null if none was issued. */
export async function renderInvoiceForPayment(paymentId: string): Promise<RenderedDocument | null> {
  const [row] = await db.select().from(invoices).where(eq(invoices.paymentId, paymentId)).limit(1);
  return row ? renderInvoiceRow(row) : null;
}

/** The file name of the deal record PDF (SPEC 17). */
export function dealRecordFilename(shortId: string): string {
  return `ValueSkins-Deal-Record-${shortId}.pdf`;
}

/** The name the same PDF had before it was called the deal record. Old emails still list it, so a resend must know it. */
function legacyDealReportFilename(shortId: string): string {
  return `ValueSkins-Deal-Report-${shortId}.pdf`;
}

/** The deal record (SPEC 17), built from the database as it is now. */
export async function renderAdp(dealId: string, generatedAt: Date): Promise<RenderedDocument> {
  const data = await loadAdpData(dealId);
  const content = await renderPdf(adpBlocks(data, generatedAt), {
    title: `ValueSkins Deal Record ${data.deal.shortId}`,
    createdAt: generatedAt,
  });
  return { filename: dealRecordFilename(data.deal.shortId), content };
}

/**
 * One of the four documents of a deal (SPEC 16). Each exists only once its payment was
 * captured, and the deal record only once the deal is COMPLETED. Access is checked by the caller.
 */
export async function renderDealDocument(
  dealId: string,
  kind: DocumentKind,
  now: Date,
): Promise<RenderedDocument> {
  if (kind === 'adp') {
    const [deal] = await db
      .select({ status: deals.status })
      .from(deals)
      .where(eq(deals.id, dealId));
    if (deal?.status !== 'COMPLETED') throw notAvailable();
    return renderAdp(dealId, now);
  }
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.dealId, dealId), eq(invoices.kind, KIND_BY_PARAM[kind])))
    .limit(1);
  if (!row) throw notAvailable();
  return renderInvoiceRow(row);
}

/**
 * The PDFs a stored email carried, rebuilt by file name for an admin resend (SPEC 12): invoices
 * and receipts from their stored snapshots (byte-identical to the first send), the deal report
 * from the database as it is now. A name that matches nothing is returned in `missing`.
 */
export async function renderAttachmentsByName(
  dealId: string,
  names: readonly string[],
  now: Date,
): Promise<{ attachments: RenderedDocument[]; missing: string[] }> {
  const attachments: RenderedDocument[] = [];
  const missing: string[] = [];
  if (names.length === 0) return { attachments, missing };

  const rows = await db.select().from(invoices).where(eq(invoices.dealId, dealId));
  const byName = new Map(
    rows.map((row) => [invoiceFilename(invoiceSnapshotSchema.parse(row.snapshot)), row]),
  );
  const [deal] = await db
    .select({ shortId: deals.shortId })
    .from(deals)
    .where(eq(deals.id, dealId));

  for (const name of names) {
    const row = byName.get(name);
    if (row) attachments.push(await renderInvoiceRow(row));
    else if (
      deal &&
      (name === dealRecordFilename(deal.shortId) || name === legacyDealReportFilename(deal.shortId))
    ) {
      attachments.push(await renderAdp(dealId, now));
    } else missing.push(name);
  }
  return { attachments, missing };
}
