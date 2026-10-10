import {
  INVOICE_SNAPSHOT_VERSION,
  isSameState,
  splitGst,
  type InvoiceKind,
  type InvoiceSnapshot,
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

export interface SnapshotInput {
  kind: InvoiceKind;
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
    type: 'COMMISSION' | 'ADVANCE' | 'FINAL';
    amountPaise: number;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    capturedAt: Date;
  };
  creator: { name: string; username: string; instagramUserId: string | null } | null;
  transferId: string | null;
}

/** The GST rate the deal was published with, recovered from its frozen amounts. */
function rateBps(basePaise: number, gstPaise: number): number {
  if (gstPaise === 0 || basePaise === 0) return 0;
  return Math.round((gstPaise * 10_000) / basePaise);
}

/**
 * Builds the frozen invoice or receipt (SPEC 7.4). Amounts come from the deal's frozen
 * breakdown, never from today's config. With no GST the commission document is an "Invoice"
 * with no tax lines; with GST it is a "Tax Invoice" split CGST + SGST or IGST by state.
 */
export function buildInvoiceSnapshot(input: SnapshotInput): InvoiceSnapshot {
  const { kind, company, deal, billing, payment } = input;
  const base = {
    version: INVOICE_SNAPSHOT_VERSION,
    kind,
    number: input.number,
    financialYear: input.financialYear,
    issuedAt: input.issuedAt.toISOString(),
    seller: {
      legalName: company.legalName,
      address: company.address,
      state: company.state,
      gstin: company.gstin,
      sacCode: null,
    },
    buyer: {
      billingName: billing.billingName,
      billingAddress: billing.billingAddress,
      billingState: billing.billingState,
      gstin: billing.gstin,
    },
    deal: { shortId: deal.shortId, title: deal.title },
    payment: {
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
      capturedAt: payment.capturedAt.toISOString(),
    },
    totalPaise: payment.amountPaise,
  } as const;

  if (kind === 'COMMISSION_TAX_INVOICE') {
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
      ...base,
      title: hasGst ? 'Tax Invoice' : 'Invoice',
      seller: { ...base.seller, sacCode: company.sacCode },
      placeOfSupply: billing.billingState,
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
      receipt: null,
    };
  }

  const label = kind === 'ADVANCE_RECEIPT' ? 'Advance' : 'Final';
  const creator = input.creator;
  if (!creator) throw new Error(`deal ${deal.shortId}: a receipt needs a creator`);
  return {
    ...base,
    title: 'Payment Receipt',
    placeOfSupply: null,
    lines: [
      {
        description: `${label} payment to ${creator.name} (@${creator.username}) for the deal "${deal.title}" (${deal.shortId}), paid through ValueSkins`,
        taxableValuePaise: payment.amountPaise,
      },
    ],
    gstRateBps: 0,
    tax: { kind: 'NONE', cgstPaise: 0, sgstPaise: 0, igstPaise: 0 },
    receipt: {
      creatorName: creator.name,
      creatorUsername: creator.username,
      creatorInstagramUserId: creator.instagramUserId,
      transferId: input.transferId,
    },
  };
}
