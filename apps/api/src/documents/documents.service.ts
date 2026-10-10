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
  'advance-receipt': 'ADVANCE_RECEIPT',
  'final-receipt': 'FINAL_RECEIPT',
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

/** The invoice or receipt for one payment, rendered from its stored snapshot. Null if none was issued. */
export async function renderInvoiceForPayment(paymentId: string): Promise<RenderedDocument | null> {
  const [row] = await db.select().from(invoices).where(eq(invoices.paymentId, paymentId)).limit(1);
  return row ? renderInvoiceRow(row) : null;
}

/** The deal report (SPEC 17), built from the database as it is now. */
export async function renderAdp(dealId: string, generatedAt: Date): Promise<RenderedDocument> {
  const data = await loadAdpData(dealId);
  const content = await renderPdf(adpBlocks(data, generatedAt), {
    title: `ValueSkins Deal Report ${data.deal.shortId}`,
    createdAt: generatedAt,
  });
  return { filename: `ValueSkins-Deal-Report-${data.deal.shortId}.pdf`, content };
}

/**
 * One of the four documents of a deal (SPEC 16). Each exists only once its payment was
 * captured, and the deal report only once the deal is COMPLETED. Access is checked by the caller.
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
