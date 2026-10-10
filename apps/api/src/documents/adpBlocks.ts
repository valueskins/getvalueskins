import { formatInr, formatIst, formatIstDate } from '@valueskins/shared';
import type { AdpData } from './adpData.js';
import type { Block } from './blocks.js';
import { invoiceBlocks } from './invoiceBlocks.js';

const NONE_YET = 'None yet';
const NOT_RECORDED = 'Not recorded';

function money(paise: number | null): string {
  return paise === null ? 'Not set' : formatInr(paise);
}

/** A calendar date such as 2026-10-12, shown as `12 Oct 2026`. */
function dateOnly(value: string | null): string {
  return value === null ? 'Not set' : formatIstDate(new Date(`${value}T12:00:00Z`));
}

function instant(value: Date | null): string {
  return value === null ? 'Not yet' : formatIst(value);
}

function fee(paise: number | null): string {
  return paise === null ? NOT_RECORDED : formatInr(paise);
}

/** The deal report (SPEC 17), section by section. It never throws on a deal that is not finished: parts that do not exist yet say so. */
export function adpBlocks(data: AdpData, generatedAt: Date): Block[] {
  const { deal, brand, creator } = data;
  const blocks: Block[] = [
    {
      kind: 'title',
      text: 'ValueSkins Deal Report',
      subtitle: `${deal.shortId}. Generated ${formatIst(generatedAt)}`,
    },

    { kind: 'heading', text: 'Parties' },
    { kind: 'row', label: 'Brand', value: `@${brand.username} (${brand.name})` },
    {
      kind: 'row',
      label: 'Brand Instagram user id',
      value: brand.instagramUserId ?? 'No Instagram account linked',
    },
    {
      kind: 'row',
      label: 'Brand billing name',
      value: data.brandBilling?.billingName ?? 'Not set',
    },
  ];
  if (data.brandBilling?.gstin) {
    blocks.push({ kind: 'row', label: 'Brand GSTIN', value: data.brandBilling.gstin });
  }
  blocks.push(
    {
      kind: 'row',
      label: 'Creator',
      value: creator ? `@${creator.username} (${creator.name})` : 'No creator confirmed',
    },
    {
      kind: 'row',
      label: 'Creator Instagram user id',
      value: creator
        ? (creator.instagramUserId ?? 'No Instagram account linked')
        : 'Not applicable',
    },

    { kind: 'heading', text: 'Terms' },
    { kind: 'row', label: 'Title', value: deal.title ?? 'Not set' },
    { kind: 'text', text: deal.description ?? 'No description' },
    { kind: 'row', label: 'Budget', value: money(deal.budgetPaise) },
    { kind: 'row', label: 'Application deadline', value: dateOnly(deal.applicationDeadline) },
    { kind: 'row', label: 'Content upload deadline', value: dateOnly(deal.contentUploadDeadline) },
    { kind: 'row', label: 'Deal deadline', value: dateOnly(deal.dealDeadline) },
    { kind: 'row', label: 'Published', value: instant(deal.publishedAt) },
    { kind: 'row', label: 'Confirmed', value: instant(deal.confirmedAt) },

    { kind: 'heading', text: 'Money' },
    { kind: 'row', label: 'Budget', value: money(deal.budgetPaise) },
    { kind: 'row', label: 'Commission base', value: money(deal.commissionBasePaise) },
    { kind: 'row', label: 'GST', value: money(deal.commissionGstPaise) },
    { kind: 'row', label: 'Commission total', value: money(deal.commissionTotalPaise) },
    { kind: 'row', label: 'Creator amount', value: money(deal.creatorAmountPaise) },
    { kind: 'row', label: 'Advance', value: money(deal.advancePaise) },
    { kind: 'row', label: 'Final', value: money(deal.finalPaise) },
  );

  const documents = [
    ['Commission tax invoice', data.invoices.commission],
    ['Advance receipt', data.invoices.advance],
    ['Final receipt', data.invoices.final],
  ] as const;
  for (const [heading, snapshot] of documents) {
    blocks.push({ kind: 'pageBreak' });
    if (snapshot) {
      blocks.push({ kind: 'heading', text: heading }, ...invoiceBlocks(snapshot));
    } else {
      blocks.push({ kind: 'heading', text: heading }, { kind: 'text', text: 'Not issued.' });
    }
  }

  blocks.push(
    { kind: 'pageBreak' },
    { kind: 'heading', text: 'Delivery proof' },
    data.uploads.length === 0
      ? { kind: 'text', text: `Content links: ${NONE_YET}` }
      : {
          kind: 'table',
          head: ['Content link', 'Uploaded'],
          widths: [0.65, 0.35],
          rows: data.uploads.map((u) => [u.link, formatIst(u.uploadedAt)]),
        },
    { kind: 'row', label: 'Revisions', value: String(deal.revisionCount) },
    data.feedbacks.length === 0
      ? { kind: 'text', text: `Feedback: ${NONE_YET}` }
      : {
          kind: 'table',
          head: ['Feedback', 'Sent'],
          widths: [0.65, 0.35],
          rows: data.feedbacks.map((f) => [f.text, formatIst(f.at)]),
        },
    { kind: 'row', label: 'Final approval', value: instant(deal.approvedAt) },

    { kind: 'heading', text: 'Transfers' },
    data.transfers.length === 0
      ? { kind: 'text', text: `Transfers: ${NONE_YET}` }
      : {
          kind: 'table',
          head: ['Type', 'Razorpay transfer id', 'Status', 'Amount'],
          widths: [0.15, 0.4, 0.2, 0.25],
          alignRight: [3],
          rows: data.transfers.map((t) => [
            t.type,
            t.razorpayTransferId ?? 'Not created yet',
            t.status,
            formatInr(t.amountPaise),
          ]),
        },
  );

  // Section 10: for information only, never charged to anyone (SPEC 4.3).
  const feeRows: string[][] = [];
  let absorbed = 0;
  let recorded = false;
  for (const p of data.payments) {
    feeRows.push([`Payment: ${p.type}`, fee(p.feePaise), fee(p.taxPaise)]);
    if (p.feePaise !== null || p.taxPaise !== null) recorded = true;
    absorbed += (p.feePaise ?? 0) + (p.taxPaise ?? 0);
  }
  for (const t of data.transfers) {
    feeRows.push([`Transfer: ${t.type}`, fee(t.feePaise), fee(t.taxPaise)]);
    if (t.feePaise !== null || t.taxPaise !== null) recorded = true;
    absorbed += (t.feePaise ?? 0) + (t.taxPaise ?? 0);
  }
  blocks.push(
    { kind: 'heading', text: 'Razorpay fees absorbed by ValueSkins (for information)' },
    feeRows.length === 0
      ? { kind: 'text', text: `Fees: ${NONE_YET}` }
      : {
          kind: 'table',
          head: ['Item', 'Fee', 'Tax on fee'],
          widths: [0.4, 0.3, 0.3],
          alignRight: [1, 2],
          rows: feeRows,
        },
    {
      kind: 'row',
      label: 'Total absorbed',
      value: recorded ? formatInr(absorbed) : NOT_RECORDED,
    },

    { kind: 'heading', text: 'Event timeline' },
    data.events.length === 0
      ? { kind: 'text', text: `Events: ${NONE_YET}` }
      : {
          kind: 'table',
          head: ['Time', 'Change', 'By', 'Note'],
          widths: [0.25, 0.3, 0.22, 0.23],
          rows: data.events.map((e) => [
            formatIst(e.at),
            `${e.from} to ${e.to}`,
            e.actor,
            e.note ?? '',
          ]),
        },
  );
  return blocks;
}
