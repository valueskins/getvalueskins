import {
  SETTLEMENT_TIMING_NOTE,
  formatInr,
  formatIst,
  formatIstDate,
  type InvoiceSnapshot,
} from '@valueskins/shared';
import type { Block } from './blocks.js';

function percent(bps: number): string {
  const value = bps / 100;
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`;
}

/** The blocks of one invoice or receipt, from its stored snapshot only (SPEC 7.4). */
export function invoiceBlocks(s: InvoiceSnapshot): Block[] {
  const blocks: Block[] = [
    { kind: 'title', text: s.title, subtitle: s.number },
    { kind: 'row', label: 'Date', value: formatIstDate(new Date(s.issuedAt)) },
    { kind: 'row', label: 'Deal', value: `${s.deal.title} (${s.deal.shortId})` },
    { kind: 'heading', text: s.receipt ? 'Issued by' : 'From' },
    { kind: 'row', label: 'Name', value: s.seller.legalName },
    { kind: 'row', label: 'Address', value: s.seller.address },
    { kind: 'row', label: 'State', value: s.seller.state },
  ];
  if (s.seller.gstin) blocks.push({ kind: 'row', label: 'GSTIN', value: s.seller.gstin });

  if (s.receipt) {
    blocks.push(
      { kind: 'heading', text: 'Paid by' },
      { kind: 'row', label: 'Name', value: s.buyer.billingName },
      { kind: 'heading', text: 'Paid to' },
      {
        kind: 'row',
        label: 'Creator',
        value: `${s.receipt.creatorName} (@${s.receipt.creatorUsername})`,
      },
      {
        kind: 'row',
        label: 'Instagram user id',
        value: s.receipt.creatorInstagramUserId ?? 'No Instagram account linked',
      },
    );
  } else {
    blocks.push(
      { kind: 'heading', text: 'To' },
      { kind: 'row', label: 'Name', value: s.buyer.billingName },
      { kind: 'row', label: 'Address', value: s.buyer.billingAddress },
      { kind: 'row', label: 'State', value: s.buyer.billingState },
    );
    if (s.buyer.gstin) blocks.push({ kind: 'row', label: 'GSTIN', value: s.buyer.gstin });
    if (s.placeOfSupply)
      blocks.push({ kind: 'row', label: 'Place of supply', value: s.placeOfSupply });
  }

  if (s.receipt) {
    blocks.push(
      { kind: 'heading', text: 'Payment' },
      {
        kind: 'table',
        head: ['Description', 'Amount'],
        widths: [0.72, 0.28],
        alignRight: [1],
        rows: s.lines.map((line) => [line.description, formatInr(line.taxableValuePaise)]),
      },
    );
  } else {
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
  }

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
  if (!s.receipt && s.tax.kind === 'NONE') {
    blocks.push({ kind: 'text', text: 'No GST is charged on this invoice.' });
  }

  blocks.push(
    { kind: 'heading', text: 'Razorpay' },
    { kind: 'row', label: 'Payment id', value: s.payment.razorpayPaymentId },
    { kind: 'row', label: 'Order id', value: s.payment.razorpayOrderId },
    { kind: 'row', label: 'Captured', value: formatIst(new Date(s.payment.capturedAt)) },
  );
  if (s.receipt) {
    blocks.push(
      {
        kind: 'row',
        label: 'Transfer id',
        value: s.receipt.transferId ?? 'Not created yet when this receipt was issued',
      },
      { kind: 'text', text: SETTLEMENT_TIMING_NOTE },
    );
  }
  return blocks;
}

export function invoiceFilename(s: InvoiceSnapshot): string {
  return `${s.number.replaceAll('/', '-')}.pdf`;
}
