import { SETTLEMENT_TIMING_NOTE, formatInr } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { seed } from '../../src/db/seed/index.js';
import { deals, invoices } from '../../src/db/schema/index.js';
import { adpBlocks } from '../../src/documents/adpBlocks.js';
import { loadAdpData } from '../../src/documents/adpData.js';
import type { Block } from '../../src/documents/blocks.js';
import { renderAdp, renderInvoiceForPayment } from '../../src/documents/documents.service.js';
import { FONT_REGULAR_PATH } from '../../src/documents/fonts.js';
import { invoiceBlocks } from '../../src/documents/invoiceBlocks.js';
import { renderPdf } from '../../src/documents/render.js';
import { buildInvoiceSnapshot, type SnapshotInput } from '../../src/invoices/snapshot.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

const ISSUED = new Date('2026-10-09T04:30:00Z');
const COMPANY = {
  legalName: 'Valueskins Private Limited',
  address: '123 MG Road, Bengaluru',
  state: 'Karnataka',
  gstin: '29AAAAA0000A1Z5',
  sacCode: '998311',
};

/** Every string a document would put on the page, in order. */
function textOf(blocks: Block[]): string[] {
  return blocks.flatMap((b) => {
    switch (b.kind) {
      case 'title':
        return [b.text, ...(b.subtitle ? [b.subtitle] : [])];
      case 'heading':
      case 'text':
        return [b.text];
      case 'row':
        return [b.label, b.value];
      case 'table':
        return [...b.head, ...b.rows.flat()];
      default:
        return [];
    }
  });
}

function commission(overrides: Partial<SnapshotInput> = {}, gst = { base: 75_000, gst: 13_500 }) {
  return buildInvoiceSnapshot({
    kind: 'COMMISSION_TAX_INVOICE',
    number: 'VS/2026-27/000001',
    financialYear: '2026-27',
    issuedAt: ISSUED,
    company: COMPANY,
    deal: {
      shortId: 'ABCD2345',
      title: 'Summer reels',
      commissionBasePaise: gst.base,
      commissionGstPaise: gst.gst,
      commissionTotalPaise: gst.base + gst.gst,
    },
    billing: {
      billingName: 'Brand Pvt Ltd',
      billingAddress: '1 Main Road',
      billingState: 'Karnataka',
      gstin: null,
    },
    payment: {
      type: 'COMMISSION',
      amountPaise: gst.base + gst.gst,
      razorpayOrderId: 'order_1',
      razorpayPaymentId: 'pay_1',
      capturedAt: ISSUED,
    },
    creator: null,
    transferId: null,
    ...overrides,
  });
}

function receipt(transferId: string | null, name = 'Creator Name') {
  return buildInvoiceSnapshot({
    kind: 'ADVANCE_RECEIPT',
    number: 'VS-R/2026-27/000001',
    financialYear: '2026-27',
    issuedAt: ISSUED,
    company: COMPANY,
    deal: {
      shortId: 'ABCD2345',
      title: 'Summer reels',
      commissionBasePaise: 0,
      commissionGstPaise: 0,
      commissionTotalPaise: 0,
    },
    billing: {
      billingName: 'Brand Pvt Ltd',
      billingAddress: '1 Main Road',
      billingState: 'Karnataka',
      gstin: null,
    },
    payment: {
      type: 'ADVANCE',
      amountPaise: 277_500,
      razorpayOrderId: 'order_2',
      razorpayPaymentId: 'pay_2',
      capturedAt: ISSUED,
    },
    creator: { name, username: 'creator_one', instagramUserId: 'ig_1' },
    transferId,
  });
}

describe('invoice blocks', () => {
  it('a tax invoice shows the title, number, parties, SAC, CGST and SGST, and the total', () => {
    const text = textOf(invoiceBlocks(commission()));
    expect(text).toEqual(
      expect.arrayContaining([
        'Tax Invoice',
        'VS/2026-27/000001',
        '9 Oct 2026',
        'Valueskins Private Limited',
        '29AAAAA0000A1Z5',
        'Brand Pvt Ltd',
        'Place of supply',
        'Karnataka',
        '998311',
        formatInr(75_000),
        'CGST (9%)',
        'SGST (9%)',
        formatInr(6_750),
        'Total',
        formatInr(88_500),
        'pay_1',
        'order_1',
      ]),
    );
    expect(text.some((t) => t.startsWith('IGST'))).toBe(false);
  });

  it('across states it shows IGST and the brand GSTIN, and with no GSTIN it shows none', () => {
    const across = textOf(
      invoiceBlocks(
        commission({
          billing: {
            billingName: 'B',
            billingAddress: 'A',
            billingState: 'Maharashtra',
            gstin: '27AAAAA0000A1Z5',
          },
        }),
      ),
    );
    expect(across).toEqual(
      expect.arrayContaining(['IGST (18%)', formatInr(13_500), '27AAAAA0000A1Z5']),
    );
    expect(across.some((t) => t.startsWith('CGST') || t.startsWith('SGST'))).toBe(false);

    const noGstin = textOf(invoiceBlocks(commission()));
    expect(noGstin.filter((t) => t === 'GSTIN')).toHaveLength(1); // the seller's only
  });

  it('with GST 0 it is an "Invoice" with no tax lines', () => {
    const text = textOf(
      invoiceBlocks(commission({ company: { ...COMPANY, gstin: null } }, { base: 75_000, gst: 0 })),
    );
    expect(text).toContain('Invoice');
    expect(text).not.toContain('Tax Invoice');
    expect(text.some((t) => /^(CGST|SGST|IGST)/.test(t))).toBe(false);
    expect(text).toContain('No GST is charged on this invoice.');
    expect(text).toContain(formatInr(75_000));
    expect(text).not.toContain('GSTIN');
  });

  it('a receipt names the creator, the amount, the transfer and the settlement note', () => {
    const text = textOf(invoiceBlocks(receipt('trf_9')));
    expect(text).toEqual(
      expect.arrayContaining([
        'Payment Receipt',
        'VS-R/2026-27/000001',
        'Paid to',
        'Creator Name (@creator_one)',
        'ig_1',
        formatInr(277_500),
        'trf_9',
        SETTLEMENT_TIMING_NOTE,
      ]),
    );
    expect(textOf(invoiceBlocks(receipt(null)))).toContain(
      'Not created yet when this receipt was issued',
    );
  });
});

describe('PDF output', () => {
  it('the font has the rupee sign', () => {
    const doc = new PDFDocument();
    doc.registerFont('R', FONT_REGULAR_PATH);
    doc.font('R');
    // PDFKit keeps the loaded fontkit font on its internal `_font`; no public API answers this.
    const font = (
      doc as unknown as { _font: { font: { hasGlyphForCodePoint(c: number): boolean } } }
    )._font.font;
    expect(font.hasGlyphForCodePoint(0x20b9)).toBe(true);
  });

  const render = (blocks: Block[]) => renderPdf(blocks, { title: 'Test', createdAt: ISSUED });

  it('is a valid PDF, including rupee amounts and non-Latin names', async () => {
    const pdf = await render(invoiceBlocks(receipt('trf_1', 'अनन्या शर्मा')));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString()).toContain('%%EOF');
    expect(pdf.length).toBeGreaterThan(2_000);
  });

  it('the same blocks render to identical bytes', async () => {
    const blocks = invoiceBlocks(commission());
    const [a, b] = [await render(blocks), await render(blocks)];
    expect(a.equals(b)).toBe(true);
  });

  it('handles long text, many table rows and page breaks', async () => {
    const blocks: Block[] = [
      { kind: 'title', text: 'Long' },
      { kind: 'text', text: 'word '.repeat(4000) },
      {
        kind: 'table',
        head: ['A', 'B'],
        widths: [0.5, 0.5],
        rows: Array.from({ length: 200 }, (_, i) => [`row ${i}`, 'x'.repeat(80)]),
      },
      { kind: 'pageBreak' },
      { kind: 'row', label: 'L', value: 'V' },
    ];
    const pdf = await render(blocks);
    const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? [];
    expect(pages.length).toBeGreaterThan(3);
  });
});

describe('every seeded deal renders its documents', () => {
  it('renders each stored invoice and the deal report for all ten deals without throwing', async () => {
    await seed({ company: COMPANY });

    const stored = await db.select().from(invoices);
    expect(stored).toHaveLength(12); // 6 commission, 5 advance, 1 final
    for (const row of stored) {
      const pdf = await renderInvoiceForPayment(row.paymentId);
      expect(pdf?.content.subarray(0, 5).toString(), row.number).toBe('%PDF-');
    }

    const all = await db.select().from(deals);
    expect(all).toHaveLength(10);
    for (const deal of all) {
      const report = await renderAdp(deal.id, new Date('2026-10-10T00:00:00Z'));
      expect(report.content.subarray(0, 5).toString(), deal.shortId).toBe('%PDF-');
      expect(report.filename).toBe(`ValueSkins-Deal-Report-${deal.shortId}.pdf`);
    }
  });
});

describe('the deal report covers every section of SPEC 17', () => {
  it('for the completed seeded deal', async () => {
    await seed({ company: COMPANY });
    const [deal] = await db.select().from(deals).where(eq(deals.status, 'COMPLETED'));
    const data = await loadAdpData(deal!.id);
    const blocks = adpBlocks(data, new Date('2026-10-10T08:00:00Z'));
    const text = textOf(blocks);
    const headings = blocks
      .filter((b) => b.kind === 'heading')
      .map((b) => (b as { text: string }).text);

    for (const heading of [
      'Parties',
      'Terms',
      'Money',
      'Commission tax invoice',
      'Advance receipt',
      'Final receipt',
      'Delivery proof',
      'Transfers',
      'Razorpay fees absorbed by ValueSkins (for information)',
      'Event timeline',
    ]) {
      expect(headings, heading).toContain(heading);
    }

    // 1 header
    expect(text).toEqual(
      expect.arrayContaining([
        'ValueSkins Deal Report',
        `${deal!.shortId}. Generated 10 Oct 2026, 13:30 IST`,
      ]),
    );
    // 2 parties
    expect(text).toEqual(
      expect.arrayContaining([
        '@brand_one (Brand One Pvt Ltd)',
        'ig_brand_1',
        'Brand One Private Limited',
        '29ABCDE1234F1Z5',
        '@creator_three (Creator Three)',
        'ig_creator_3',
      ]),
    );
    // 3 and 4 terms and money
    expect(text).toEqual(
      expect.arrayContaining([
        deal!.title!,
        formatInr(deal!.budgetPaise!),
        formatInr(deal!.commissionGstPaise!),
        formatInr(deal!.creatorAmountPaise!),
        formatInr(deal!.advancePaise!),
        formatInr(deal!.finalPaise!),
      ]),
    );
    // 5 to 7 the three full documents
    expect(text.filter((t) => /^VS\/2026-27\/\d{6}$/.test(t))).toHaveLength(1);
    expect(text.filter((t) => /^VS-R\/2026-27\/\d{6}$/.test(t))).toHaveLength(2);
    // 8 delivery proof
    expect(text).toEqual(
      expect.arrayContaining([
        'https://drive.google.com/file/d/seed-content/view',
        'Revisions',
        'Final approval',
      ]),
    );
    // 9 transfers
    expect(text).toEqual(
      expect.arrayContaining(['trf_seed_8_advance', 'trf_seed_8_final', 'PROCESSED']),
    );
    // 10 fees
    expect(text).toEqual(
      expect.arrayContaining(['Payment: COMMISSION', 'Transfer: FINAL', 'Total absorbed']),
    );
    expect(text).not.toContain('Not recorded');
    // 11 timeline
    expect(text).toEqual(
      expect.arrayContaining(['DRAFT to OPEN', 'APPROVED to COMPLETED', 'System']),
    );
  });

  it('shows what is missing instead of failing, for a deal that has not got far', async () => {
    await seed({ company: COMPANY });
    const [deal] = await db.select().from(deals).where(eq(deals.status, 'OPEN'));
    const text = textOf(adpBlocks(await loadAdpData(deal!.id), new Date('2026-10-10T08:00:00Z')));
    expect(text).toEqual(
      expect.arrayContaining([
        'No creator confirmed',
        'Not issued.',
        'Content links: None yet',
        'Transfers: None yet',
        'Fees: None yet',
      ]),
    );
  });
});
