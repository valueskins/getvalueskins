import {
  financialYearOf,
  maskVpa,
  type DirectPaymentStage,
  type InvoiceKind,
} from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { brandBilling, invoices, users } from '../db/schema/index.js';
import type { Deal } from '../deals/stateMachine.js';
import { nextInvoiceNumber, type Executor } from './numbering.js';
import {
  buildInvoiceSnapshot,
  buildPaymentRecordSnapshot,
  type CompanyDetails,
} from './snapshot.js';

export const PAYMENT_RECORD_KIND_BY_STAGE = {
  ADVANCE: 'ADVANCE_PAYMENT_RECORD',
  FINAL: 'FINAL_PAYMENT_RECORD',
} as const satisfies Record<DirectPaymentStage, InvoiceKind>;

async function loadBilling(executor: Executor, deal: Deal) {
  const [billing] = await executor
    .select()
    .from(brandBilling)
    .where(eq(brandBilling.userId, deal.brandId))
    .limit(1);
  if (!billing) throw new Error(`deal ${deal.shortId}: the brand has no billing details`);
  return billing;
}

export interface IssueInvoiceInput {
  deal: Deal;
  payment: {
    id: string;
    amountPaise: number;
    razorpayOrderId: string;
    razorpayPaymentId: string;
  };
  now: Date;
  company: CompanyDetails;
}

/**
 * Issues the commission invoice for a captured payment (SPEC 7.4). Run it inside the
 * transaction that marks the payment captured: the number, the snapshot and the row are
 * written together or not at all.
 */
export async function issueInvoice(executor: Executor, input: IssueInvoiceInput) {
  const { deal, payment, now } = input;
  const kind = 'COMMISSION_TAX_INVOICE' as const;
  const financialYear = financialYearOf(now);
  const billing = await loadBilling(executor, deal);

  const { number, sequence } = await nextInvoiceNumber(executor, kind, financialYear);
  const snapshot = buildInvoiceSnapshot({
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
      amountPaise: payment.amountPaise,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
      capturedAt: now,
    },
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

export interface IssuePaymentRecordInput {
  deal: Deal;
  directPayment: {
    id: string;
    stage: DirectPaymentStage;
    amountPaise: number;
    reference: string;
    note: string | null;
    /** The UPI ID the brand paid. Masked before it goes into the snapshot. */
    paidToVpa: string;
    recordedAt: Date;
  };
  /** When the creator confirmed it. */
  now: Date;
  company: CompanyDetails;
}

/**
 * Issues the payment record for a direct payment the creator just confirmed (REPLACEMENT_PLAN
 * 2.1). Run it inside the confirming transaction, so the number, the snapshot and the row are
 * written together with the confirmation or not at all.
 */
export async function issuePaymentRecord(executor: Executor, input: IssuePaymentRecordInput) {
  const { deal, directPayment, now } = input;
  if (!deal.creatorId) throw new Error(`deal ${deal.shortId}: a payment record needs a creator`);
  const kind = PAYMENT_RECORD_KIND_BY_STAGE[directPayment.stage];
  const financialYear = financialYearOf(now);
  const billing = await loadBilling(executor, deal);
  const [creator] = await executor
    .select({
      name: users.name,
      username: users.username,
      instagramUserId: users.instagramUserId,
      payoutName: users.payoutName,
    })
    .from(users)
    .where(eq(users.id, deal.creatorId))
    .limit(1);
  if (!creator) throw new Error(`deal ${deal.shortId}: the creator row is missing`);

  const { number, sequence } = await nextInvoiceNumber(executor, kind, financialYear);
  const snapshot = buildPaymentRecordSnapshot({
    kind,
    number,
    financialYear,
    issuedAt: now,
    company: input.company,
    deal: { shortId: deal.shortId, title: deal.title ?? '' },
    brandBillingName: billing.billingName,
    stage: directPayment.stage,
    amountPaise: directPayment.amountPaise,
    reference: directPayment.reference,
    note: directPayment.note,
    payee: {
      name: creator.payoutName ?? creator.name,
      maskedVpa: maskVpa(directPayment.paidToVpa),
      username: creator.username,
      instagramUserId: creator.instagramUserId,
    },
    recordedAt: directPayment.recordedAt,
    confirmedAt: now,
  });

  const [row] = await executor
    .insert(invoices)
    .values({
      dealId: deal.id,
      directPaymentId: directPayment.id,
      kind,
      number,
      financialYear,
      sequence,
      snapshot: snapshot as unknown as Record<string, unknown>,
      issuedAt: now,
    })
    .returning();
  if (!row) throw new Error('payment record insert returned no row');
  return row;
}
