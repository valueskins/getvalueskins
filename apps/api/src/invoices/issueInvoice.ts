import { financialYearOf, type InvoiceKind } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { brandBilling, invoices, users } from '../db/schema/index.js';
import type { Deal } from '../deals/stateMachine.js';
import { nextInvoiceNumber, type Executor } from './numbering.js';
import { buildInvoiceSnapshot, type CompanyDetails } from './snapshot.js';

export const INVOICE_KIND_BY_PAYMENT = {
  COMMISSION: 'COMMISSION_TAX_INVOICE',
  ADVANCE: 'ADVANCE_RECEIPT',
  FINAL: 'FINAL_RECEIPT',
} as const satisfies Record<string, InvoiceKind>;

export interface IssueInvoiceInput {
  deal: Deal;
  payment: {
    id: string;
    type: 'COMMISSION' | 'ADVANCE' | 'FINAL';
    amountPaise: number;
    razorpayOrderId: string;
    razorpayPaymentId: string;
  };
  /** Receipts: the Razorpay transfer id, if Razorpay had created the transfer yet. */
  transferId: string | null;
  now: Date;
  company: CompanyDetails;
}

/**
 * Issues the invoice or receipt for a captured payment (SPEC 7.4). Run it inside the
 * transaction that marks the payment captured: the number, the snapshot and the row are
 * written together or not at all.
 */
export async function issueInvoice(executor: Executor, input: IssueInvoiceInput) {
  const { deal, payment, now } = input;
  const kind = INVOICE_KIND_BY_PAYMENT[payment.type];
  const financialYear = financialYearOf(now);

  const [billing] = await executor
    .select()
    .from(brandBilling)
    .where(eq(brandBilling.userId, deal.brandId))
    .limit(1);
  if (!billing) throw new Error(`deal ${deal.shortId}: the brand has no billing details`);

  let creator = null;
  if (kind !== 'COMMISSION_TAX_INVOICE' && deal.creatorId) {
    const [row] = await executor
      .select({
        name: users.name,
        username: users.username,
        instagramUserId: users.instagramUserId,
      })
      .from(users)
      .where(eq(users.id, deal.creatorId))
      .limit(1);
    creator = row ?? null;
  }

  const { number, sequence } = await nextInvoiceNumber(executor, kind, financialYear);
  const snapshot = buildInvoiceSnapshot({
    kind,
    number,
    financialYear,
    issuedAt: now,
    company: input.company,
    deal: {
      shortId: deal.shortId,
      title: deal.title ?? '',
      commissionBasePaise: deal.commissionBasePaise ?? 0,
      commissionGstPaise: deal.commissionGstPaise ?? 0,
      commissionTotalPaise: deal.commissionTotalPaise ?? 0,
    },
    billing: {
      billingName: billing.billingName,
      billingAddress: billing.billingAddress,
      billingState: billing.billingState,
      gstin: billing.gstin,
    },
    payment: {
      type: payment.type,
      amountPaise: payment.amountPaise,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
      capturedAt: now,
    },
    creator,
    transferId: input.transferId,
  });

  const [row] = await executor
    .insert(invoices)
    .values({
      dealId: deal.id,
      paymentId: payment.id,
      kind,
      number,
      financialYear,
      sequence,
      snapshot: snapshot as unknown as Record<string, unknown>,
      issuedAt: now,
    })
    .returning();
  if (!row) throw new Error('invoice insert returned no row');
  return row;
}
