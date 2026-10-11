import { z } from 'zod';
import { DIRECT_PAYMENT_STAGES, type InvoiceKind } from './enums.js';

/**
 * SPEC 7.4 numbering. Tax invoices have their own series (`VS/<FY>/NNNNNN`). The advance and
 * final payment records share one (`VS-PR/<FY>/NNNNNN`), counted on the ADVANCE_PAYMENT_RECORD
 * row of invoice_counters.
 */
export function invoiceSeries(kind: InvoiceKind): { counterKind: InvoiceKind; prefix: string } {
  if (kind === 'COMMISSION_TAX_INVOICE') return { counterKind: kind, prefix: 'VS' };
  return { counterKind: 'ADVANCE_PAYMENT_RECORD', prefix: 'VS-PR' };
}

export function invoiceNumber(kind: InvoiceKind, financialYear: string, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError(`invoice sequence must be a positive integer, got ${sequence}`);
  }
  return `${invoiceSeries(kind).prefix}/${financialYear}/${String(sequence).padStart(6, '0')}`;
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** The Indian financial year (April to March) of an instant, in IST: `2026-27`. */
export function financialYearOf(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const startYear = ist.getUTCMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function normalizeState(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Place of supply is the brand's state: same state as the company means CGST + SGST. Free text, so case and spacing are ignored. */
export function isSameState(a: string, b: string): boolean {
  const left = normalizeState(a);
  return left !== '' && left === normalizeState(b);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `9 Oct 2026, 15:30 IST`. Done by hand so it never depends on the runtime's ICU data. */
export function formatIst(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())} IST`;
}

/** `9 Oct 2026` in IST. */
export function formatIstDate(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

/** Bump when the snapshot shape changes, so old rows can still be read. */
export const INVOICE_SNAPSHOT_VERSION = 1 as const;

export const TAX_KINDS = ['NONE', 'CGST_SGST', 'IGST'] as const;
export type TaxKind = (typeof TAX_KINDS)[number];

export const INVOICE_TITLES = ['Tax Invoice', 'Invoice'] as const;
export const PAYMENT_RECORD_TITLE = 'Payment Record' as const;

const sellerSchema = z.object({
  legalName: z.string(),
  address: z.string(),
  state: z.string(),
  gstin: z.string().nullable(),
  sacCode: z.string().nullable(),
});

/**
 * The commission invoice, frozen when it is issued and stored whole in invoices.snapshot
 * (SPEC 7.4). Renderers read only this, so a re-render is identical.
 */
export const commissionSnapshotSchema = z.object({
  version: z.literal(INVOICE_SNAPSHOT_VERSION),
  kind: z.literal('COMMISSION_TAX_INVOICE'),
  number: z.string(),
  financialYear: z.string(),
  issuedAt: z.string(),
  title: z.enum(INVOICE_TITLES),
  seller: sellerSchema,
  buyer: z.object({
    billingName: z.string(),
    billingAddress: z.string(),
    billingState: z.string(),
    gstin: z.string().nullable(),
  }),
  placeOfSupply: z.string().nullable(),
  deal: z.object({ shortId: z.string(), title: z.string() }),
  lines: z.array(z.object({ description: z.string(), taxableValuePaise: z.number().int() })),
  gstRateBps: z.number().int().min(0),
  tax: z.object({
    kind: z.enum(TAX_KINDS),
    cgstPaise: z.number().int(),
    sgstPaise: z.number().int(),
    igstPaise: z.number().int(),
  }),
  totalPaise: z.number().int(),
  payment: z.object({
    razorpayOrderId: z.string(),
    razorpayPaymentId: z.string(),
    capturedAt: z.string(),
  }),
});

/**
 * A payment record (REPLACEMENT_PLAN 2.1): not a receipt and not a GST document. The brand paid
 * the creator directly by UPI; ValueSkins did not receive or hold that money. The payee's UPI ID
 * is stored masked, never in full.
 */
export const paymentRecordSnapshotSchema = z.object({
  version: z.literal(INVOICE_SNAPSHOT_VERSION),
  kind: z.enum(['ADVANCE_PAYMENT_RECORD', 'FINAL_PAYMENT_RECORD']),
  number: z.string(),
  financialYear: z.string(),
  issuedAt: z.string(),
  title: z.literal(PAYMENT_RECORD_TITLE),
  seller: sellerSchema,
  brandBillingName: z.string(),
  deal: z.object({ shortId: z.string(), title: z.string() }),
  stage: z.enum(DIRECT_PAYMENT_STAGES),
  amountPaise: z.number().int().positive(),
  reference: z.string(),
  note: z.string().nullable(),
  payee: z.object({
    name: z.string(),
    maskedVpa: z.string(),
    username: z.string(),
    instagramUserId: z.string().nullable(),
  }),
  recordedAt: z.string(),
  confirmedAt: z.string(),
});

export const invoiceSnapshotSchema = z.discriminatedUnion('kind', [
  commissionSnapshotSchema,
  paymentRecordSnapshotSchema,
]);

export type CommissionSnapshot = z.infer<typeof commissionSnapshotSchema>;
export type PaymentRecordSnapshot = z.infer<typeof paymentRecordSnapshotSchema>;
export type InvoiceSnapshot = z.infer<typeof invoiceSnapshotSchema>;
