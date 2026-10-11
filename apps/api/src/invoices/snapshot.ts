import {
  INVOICE_SNAPSHOT_VERSION,
  PAYMENT_RECORD_TITLE,
  isSameState,
  splitGst,
  type CommissionSnapshot,
  type DirectPaymentStage,
  type PaymentRecordSnapshot,
} from '@valueskins/shared';

/** Seller details, frozen into every invoice from env at the time it is issued. */
export interface CompanyDetails {
  legalName: string;
  address: string;
  state: string;
  gstin: string | null;
  sacCode: string;
}

export function companyFromEnv(env: {
  COMPANY_LEGAL_NAME: string;
  COMPANY_ADDRESS: string;
  COMPANY_STATE: string;
  COMPANY_GSTIN: string;
  COMMISSION_SAC_CODE: string;
}): CompanyDetails {
  return {
    legalName: env.COMPANY_LEGAL_NAME,
    address: env.COMPANY_ADDRESS,
    state: env.COMPANY_STATE,
    gstin: env.COMPANY_GSTIN.trim() === '' ? null : env.COMPANY_GSTIN.trim(),
    sacCode: env.COMMISSION_SAC_CODE,
  };
}

export interface CommissionSnapshotInput {
  number: string;
  financialYear: string;
  issuedAt: Date;
  company: CompanyDetails;
  deal: {
    shortId: string;
    title: string;
    commissionBasePaise: number;
    commissionGstPaise: number;
    commissionTotalPaise: number;
  };
  billing: {
    billingName: string;
    billingAddress: string;
    billingState: string;
    gstin: string | null;
  };
  payment: {
    amountPaise: number;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    capturedAt: Date;
  };
}

/** The GST rate the deal was published with, recovered from its frozen amounts. */
function rateBps(basePaise: number, gstPaise: number): number {
  if (gstPaise === 0 || basePaise === 0) return 0;
  return Math.round((gstPaise * 10_000) / basePaise);
}

/**
 * Builds the frozen commission invoice (SPEC 7.4). Amounts come from the deal's frozen
 * breakdown, never from today's config. With no GST the document is an "Invoice" with no tax
 * lines; with GST it is a "Tax Invoice" split CGST + SGST or IGST by state.
 */
export function buildInvoiceSnapshot(input: CommissionSnapshotInput): CommissionSnapshot {
  const { company, deal, billing, payment } = input;
  if (
    deal.commissionBasePaise + deal.commissionGstPaise !== deal.commissionTotalPaise ||
    deal.commissionTotalPaise !== payment.amountPaise
  ) {
    throw new Error(`deal ${deal.shortId}: the commission breakdown does not match the payment`);
  }
  const hasGst = deal.commissionGstPaise > 0;
  const intraState = isSameState(billing.billingState, company.state);
  const split = splitGst(deal.commissionGstPaise, intraState);
  return {
    version: INVOICE_SNAPSHOT_VERSION,
    kind: 'COMMISSION_TAX_INVOICE',
    number: input.number,
    financialYear: input.financialYear,
    issuedAt: input.issuedAt.toISOString(),
    title: hasGst ? 'Tax Invoice' : 'Invoice',
    seller: {
      legalName: company.legalName,
      address: company.address,
      state: company.state,
      gstin: company.gstin,
      sacCode: company.sacCode,
    },
    buyer: {
      billingName: billing.billingName,
      billingAddress: billing.billingAddress,
      billingState: billing.billingState,
      gstin: billing.gstin,
    },
    placeOfSupply: billing.billingState,
    deal: { shortId: deal.shortId, title: deal.title },
    lines: [
      {
        description: `Platform commission for the deal "${deal.title}" (${deal.shortId})`,
        taxableValuePaise: deal.commissionBasePaise,
      },
    ],
    gstRateBps: rateBps(deal.commissionBasePaise, deal.commissionGstPaise),
    tax: {
      kind: !hasGst ? 'NONE' : intraState ? 'CGST_SGST' : 'IGST',
      cgstPaise: split.cgstPaise,
      sgstPaise: split.sgstPaise,
      igstPaise: split.igstPaise,
    },
    totalPaise: payment.amountPaise,
    payment: {
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
      capturedAt: payment.capturedAt.toISOString(),
    },
  };
}

export interface PaymentRecordInput {
  kind: PaymentRecordSnapshot['kind'];
  number: string;
  financialYear: string;
  issuedAt: Date;
  company: CompanyDetails;
  deal: { shortId: string; title: string };
  brandBillingName: string;
  stage: DirectPaymentStage;
  amountPaise: number;
  reference: string;
  note: string | null;
  payee: { name: string; maskedVpa: string; username: string; instagramUserId: string | null };
  recordedAt: Date;
  confirmedAt: Date;
}

/**
 * Builds the frozen payment record (REPLACEMENT_PLAN 2.1): the brand paid the creator directly
 * by UPI and the creator confirmed it. It is not a receipt and not a GST document. Only the
 * masked UPI ID is stored here.
 */
export function buildPaymentRecordSnapshot(input: PaymentRecordInput): PaymentRecordSnapshot {
  const { company } = input;
  return {
    version: INVOICE_SNAPSHOT_VERSION,
    kind: input.kind,
    number: input.number,
    financialYear: input.financialYear,
    issuedAt: input.issuedAt.toISOString(),
    title: PAYMENT_RECORD_TITLE,
    seller: {
      legalName: company.legalName,
      address: company.address,
      state: company.state,
      gstin: company.gstin,
      sacCode: null,
    },
    brandBillingName: input.brandBillingName,
    deal: input.deal,
    stage: input.stage,
    amountPaise: input.amountPaise,
    reference: input.reference,
    note: input.note,
    payee: input.payee,
    recordedAt: input.recordedAt.toISOString(),
    confirmedAt: input.confirmedAt.toISOString(),
  };
}
