import {
  PAYMENT_RECORD_DISCLAIMER,
  formatInr,
  formatIst,
  formatIstDate,
  type CommissionSnapshot,
  type InvoiceSnapshot,
  type PaymentRecordSnapshot,
} from '@valueskins/shared';
import type { Block } from './blocks.js';

function percent(bps: number): string {
  const value = bps / 100;
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`;
}

/** The blocks of one commission invoice, from its stored snapshot only (SPEC 7.4). */
export function commissionBlocks(s: CommissionSnapshot): Block[] {
  const blocks: Block[] = [
    { kind: 'title', text: s.title, subtitle: s.number },
    { kind: 'row', label: 'Date', value: formatIstDate(new Date(s.issuedAt)) },
    { kind: 'row', label: 'Deal', value: `${s.deal.title} (${s.deal.shortId})` },
    { kind: 'heading', text: 'From' },
    { kind: 'row', label: 'Name', value: s.seller.legalName },
    { kind: 'row', label: 'Address', value: s.seller.address },
    { kind: 'row', label: 'State', value: s.seller.state },
  ];
  if (s.seller.gstin) blocks.push({ kind: 'row', label: 'GSTIN', value: s.seller.gstin });

  blocks.push(
    { kind: 'heading', text: 'To' },
    { kind: 'row', label: 'Name', value: s.buyer.billingName },
    { kind: 'row', label: 'Address', value: s.buyer.billingAddress },
    { kind: 'row', label: 'State', value: s.buyer.billingState },
  );
  if (s.buyer.gstin) blocks.push({ kind: 'row', label: 'GSTIN', value: s.buyer.gstin });
  if (s.placeOfSupply)
    blocks.push({ kind: 'row', label: 'Place of supply', value: s.placeOfSupply });

  blocks.push(
    { kind: 'heading', text: 'Charges' },
    {
      kind: 'table',
      head: ['Description', 'SAC', 'Taxable value'],
      widths: [0.55, 0.15, 0.3],
      alignRight: [2],
      rows: s.lines.map((line) => [
        line.description,
        s.seller.sacCode ?? '',
        formatInr(line.taxableValuePaise),
      ]),
    },
  );

  const taxRows: string[][] = [];
  if (s.tax.kind === 'CGST_SGST') {
    taxRows.push(
      [`CGST (${percent(s.gstRateBps / 2)})`, formatInr(s.tax.cgstPaise)],
      [`SGST (${percent(s.gstRateBps / 2)})`, formatInr(s.tax.sgstPaise)],
    );
  } else if (s.tax.kind === 'IGST') {
    taxRows.push([`IGST (${percent(s.gstRateBps)})`, formatInr(s.tax.igstPaise)]);
  }
  blocks.push({
    kind: 'table',
    head: ['Item', 'Amount'],
    widths: [0.72, 0.28],
    alignRight: [1],
    rows: [...taxRows, ['Total', formatInr(s.totalPaise)]],
  });
  if (s.tax.kind === 'NONE') {
    blocks.push({ kind: 'text', text: 'No GST is charged on this invoice.' });
  }

  blocks.push(
    { kind: 'heading', text: 'Razorpay' },
    { kind: 'row', label: 'Payment id', value: s.payment.razorpayPaymentId },
    { kind: 'row', label: 'Order id', value: s.payment.razorpayOrderId },
    { kind: 'row', label: 'Captured', value: formatIst(new Date(s.payment.capturedAt)) },
  );
  return blocks;
}

/**
 * The blocks of one payment record (REPLACEMENT_PLAN 2.1): the brand paid the creator directly
 * by UPI and the creator confirmed it arrived. It is not a receipt and not a GST document.
 */
export function paymentRecordBlocks(s: PaymentRecordSnapshot): Block[] {
  const stage = s.stage === 'ADVANCE' ? 'Advance' : 'Final';
  const blocks: Block[] = [
    { kind: 'title', text: s.title, subtitle: s.number },
    { kind: 'row', label: 'Date', value: formatIstDate(new Date(s.issuedAt)) },
    { kind: 'row', label: 'Deal', value: `${s.deal.title} (${s.deal.shortId})` },
    { kind: 'heading', text: 'Issued by' },
    { kind: 'row', label: 'Name', value: s.seller.legalName },
    { kind: 'row', label: 'Address', value: s.seller.address },
    { kind: 'row', label: 'State', value: s.seller.state },
  ];
  if (s.seller.gstin) blocks.push({ kind: 'row', label: 'GSTIN', value: s.seller.gstin });

  blocks.push(
    { kind: 'heading', text: 'Paid by' },
    { kind: 'row', label: 'Name', value: s.brandBillingName },
    { kind: 'heading', text: 'Paid to' },
    { kind: 'row', label: 'Name on the account', value: s.payee.name },
    { kind: 'row', label: 'Creator', value: `${s.payee.name} (@${s.payee.username})` },
    {
      kind: 'row',
      label: 'Instagram user id',
      value: s.payee.instagramUserId ?? 'No Instagram account linked',
    },
    { kind: 'row', label: 'UPI ID', value: s.payee.maskedVpa },
    { kind: 'heading', text: 'Payment' },
    {
      kind: 'table',
      head: ['Description', 'Amount'],
      widths: [0.72, 0.28],
      alignRight: [1],
      rows: [
        [
          `${stage} payment for the deal "${s.deal.title}" (${s.deal.shortId})`,
          formatInr(s.amountPaise),
        ],
      ],
    },
    { kind: 'text', text: PAYMENT_RECORD_DISCLAIMER },
    { kind: 'row', label: 'UPI reference', value: s.reference },
  );
  if (s.note) blocks.push({ kind: 'row', label: 'Note', value: s.note });
  blocks.push(
    { kind: 'row', label: 'Recorded by the brand', value: formatIst(new Date(s.recordedAt)) },
    { kind: 'row', label: 'Confirmed by the creator', value: formatIst(new Date(s.confirmedAt)) },
  );
  return blocks;
}

/** The blocks of one stored document, by its snapshot kind. */
export function invoiceBlocks(s: InvoiceSnapshot): Block[] {
  return s.kind === 'COMMISSION_TAX_INVOICE' ? commissionBlocks(s) : paymentRecordBlocks(s);
}

export function invoiceFilename(s: InvoiceSnapshot): string {
  return `${s.number.replaceAll('/', '-')}.pdf`;
}
