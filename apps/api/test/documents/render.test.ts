import { PAYMENT_RECORD_DISCLAIMER, formatInr } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { seed } from '../../src/db/seed/index.js';
import { deals, invoices } from '../../src/db/schema/index.js';
import { adpBlocks } from '../../src/documents/adpBlocks.js';
import { loadAdpData } from '../../src/documents/adpData.js';
import type { Block } from '../../src/documents/blocks.js';
import {
  renderAdp,
  renderInvoiceForPayment,
  renderRecordForDirectPayment,
} from '../../src/documents/documents.service.js';
import { FONT_REGULAR_PATH } from '../../src/documents/fonts.js';
import { invoiceBlocks } from '../../src/documents/invoiceBlocks.js';
import { renderPdf } from '../../src/documents/render.js';
import {
  buildInvoiceSnapshot,
  buildPaymentRecordSnapshot,
  type CommissionSnapshotInput,
} from '../../src/invoices/snapshot.js';
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

function commission(
  overrides: Partial<CommissionSnapshotInput> = {},
  gst = { base: 75_000, gst: 13_500 },
) {
  return buildInvoiceSnapshot({
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
      amountPaise: gst.base + gst.gst,
      razorpayOrderId: 'order_1',
      razorpayPaymentId: 'pay_1',
      capturedAt: ISSUED,
    },
    ...overrides,
  });
}

function paymentRecord(name = 'Creator Name', note: string | null = null) {
  return buildPaymentRecordSnapshot({
    kind: 'ADVANCE_PAYMENT_RECORD',
    number: 'VS-PR/2026-27/000001',
    financialYear: '2026-27',
    issuedAt: ISSUED,
    company: COMPANY,
    deal: { shortId: 'ABCD2345', title: 'Summer reels' },
    brandBillingName: 'Brand Pvt Ltd',
    stage: 'ADVANCE',
    amountPaise: 277_500,
    reference: 'UTR123456789',
    note,
    payee: {
      name,
      maskedVpa: 'cr\u2022\u2022\u2022@okaxis',
      username: 'creator_one',
      instagramUserId: 'ig_1',
    },
    recordedAt: new Date('2026-10-09T03:00:00Z'),
    confirmedAt: ISSUED,
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

  it('a payment record says it is not a receipt: paid directly by UPI, never held by ValueSkins', () => {
    const text = textOf(invoiceBlocks(paymentRecord('Creator Name', 'paid at noon')));
    expect(text).toEqual(
      expect.arrayContaining([
        'Payment Record',
        'VS-PR/2026-27/000001',
        'Paid by',
        'Brand Pvt Ltd',
        'Paid to',
        'Creator Name (@creator_one)',
        'ig_1',
        'cr\u2022\u2022\u2022@okaxis',
        formatInr(277_500),
        PAYMENT_RECORD_DISCLAIMER,
        'UTR123456789',
        'paid at noon',
        'Recorded by the brand',
        '9 Oct 2026, 08:30 IST',
        'Confirmed by the creator',
        '9 Oct 2026, 10:00 IST',
      ]),
    );
    // Not a receipt, not a GST document, and nothing from Razorpay.
    expect(text.join(' ')).not.toMatch(/receipt|Razorpay|transfer|settlement/i);
  });

  it('a payment record has no note row when there is no note, and never the full UPI ID', () => {
    const text = textOf(invoiceBlocks(paymentRecord()));
    expect(text).not.toContain('Note');
    expect(JSON.stringify(paymentRecord())).not.toContain('paidToVpa');
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
    const pdf = await render(invoiceBlocks(paymentRecord('अनन्या शर्मा')));
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
    expect(stored).toHaveLength(12); // 6 commission invoices, 5 advance and 1 final payment record
    for (const row of stored) {
      const pdf = row.paymentId
        ? await renderInvoiceForPayment(row.paymentId)
        : await renderRecordForDirectPayment(row.directPaymentId as string);
      expect(pdf?.content.subarray(0, 5).toString(), row.number).toBe('%PDF-');
    }

    const all = await db.select().from(deals);
    expect(all).toHaveLength(10);
    for (const deal of all) {
      const report = await renderAdp(deal.id, new Date('2026-10-10T00:00:00Z'));
      expect(report.content.subarray(0, 5).toString(), deal.shortId).toBe('%PDF-');
      expect(report.filename).toBe(`ValueSkins-Deal-Record-${deal.shortId}.pdf`);
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
      'ValueSkins fee tax invoice',
      'Advance payment record',
      'Final payment record',
      'Delivery proof',
      'Direct payments (brand to creator, by UPI)',
      'Razorpay fees absorbed by ValueSkins (for information)',
      'Event timeline',
    ]) {
      expect(headings, heading).toContain(heading);
    }

    // 1 header
    expect(text).toEqual(
      expect.arrayContaining([
        'ValueSkins Deal Record',
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
    expect(text.filter((t) => /^VS-PR\/2026-27\/\d{6}$/.test(t))).toHaveLength(2);
    // 8 delivery proof
    expect(text).toEqual(
      expect.arrayContaining([
        'https://drive.google.com/file/d/seed-content/view',
        'Revisions',
        'Final approval',
      ]),
    );
    // 9 direct payments, with the creator's UPI ID masked
    expect(text).toEqual(
      expect.arrayContaining([
        PAYMENT_RECORD_DISCLAIMER,
        'ADVANCE',
        'FINAL',
        'se\u2022\u2022\u2022@okaxis',
      ]),
    );
    expect(text.join(' ')).not.toContain('seedcreator');
    expect(text.some((t) => t.startsWith('Confirmed '))).toBe(true);
    // 10 fees
    expect(text).toEqual(expect.arrayContaining(['Payment: COMMISSION', 'Total absorbed']));
    expect(text).not.toContain('Not recorded');
    // 11 timeline
    expect(text).toEqual(
      expect.arrayContaining([
        'DRAFT to OPEN',
        'APPROVED to COMPLETED',
        'System',
        '@creator_three',
      ]),
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
        'Direct payments: None yet',
        'Fees: None yet',
      ]),
    );
  });
});
