import { computeBreakdown, invoiceSnapshotSchema } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { brandBilling, invoices } from '../../src/db/schema/index.js';
import { buildInvoiceSnapshot, type SnapshotInput } from '../../src/invoices/snapshot.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http as api,
  insertDeal,
} from '../helpers/deals.js';
import { verifyBody } from '../helpers/payments.js';
import { buildTestEnv } from '../testEnv.js';
import { razorpayCaptured } from '../payments/fixture.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';

const COMPANY = {
  legalName: 'Valueskins Private Limited',
  address: '123 MG Road, Bengaluru',
  state: 'Karnataka',
  gstin: '29AAAAA0000A1Z5',
  sacCode: '998311',
};

function commissionInput(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  const b = computeBreakdown(10_000_00, 1800);
  return {
    kind: 'COMMISSION_TAX_INVOICE',
    number: 'VS/2026-27/000001',
    financialYear: '2026-27',
    issuedAt: NOW,
    company: COMPANY,
    deal: {
      shortId: 'ABCD2345',
      title: 'Summer reels',
      commissionBasePaise: b.commissionBasePaise,
      commissionGstPaise: b.commissionGstPaise,
      commissionTotalPaise: b.commissionTotalPaise,
    },
    billing: {
      billingName: 'Brand Pvt Ltd',
      billingAddress: '1 Main Road',
      billingState: 'Karnataka',
      gstin: null,
    },
    payment: {
      type: 'COMMISSION',
      amountPaise: b.commissionTotalPaise,
      razorpayOrderId: 'order_1',
      razorpayPaymentId: 'pay_1',
      capturedAt: NOW,
    },
    creator: null,
    transferId: null,
    ...overrides,
  };
}

describe('buildInvoiceSnapshot: the commission invoice', () => {
  it('splits GST into CGST and SGST when the brand is in the company state', () => {
    const s = buildInvoiceSnapshot(commissionInput());
    expect(s).toMatchObject({
      title: 'Tax Invoice',
      gstRateBps: 1800,
      placeOfSupply: 'Karnataka',
      totalPaise: 88_500,
      lines: [{ taxableValuePaise: 75_000 }],
      tax: { kind: 'CGST_SGST', cgstPaise: 6_750, sgstPaise: 6_750, igstPaise: 0 },
      seller: { gstin: '29AAAAA0000A1Z5', sacCode: '998311' },
    });
    expect(s.lines[0]!.taxableValuePaise + s.tax.cgstPaise + s.tax.sgstPaise).toBe(s.totalPaise);
  });

  it('uses IGST across states, and ignores case and spacing when comparing states', () => {
    const across = buildInvoiceSnapshot(
      commissionInput({
        billing: {
          billingName: 'B',
          billingAddress: 'A',
          billingState: 'Maharashtra',
          gstin: '27AAAAA0000A1Z5',
        },
      }),
    );
    expect(across.tax).toEqual({ kind: 'IGST', cgstPaise: 0, sgstPaise: 0, igstPaise: 13_500 });
    expect(across.buyer.gstin).toBe('27AAAAA0000A1Z5');
    expect(across.placeOfSupply).toBe('Maharashtra');

    const sameSpelledDifferently = buildInvoiceSnapshot(
      commissionInput({
        billing: {
          billingName: 'B',
          billingAddress: 'A',
          billingState: '  KARNATAKA ',
          gstin: null,
        },
      }),
    );
    expect(sameSpelledDifferently.tax.kind).toBe('CGST_SGST');
  });

  it('gives the odd paisa to SGST so the halves add up', () => {
    const s = buildInvoiceSnapshot(
      commissionInput({
        deal: {
          shortId: 'ABCD2345',
          title: 'x',
          commissionBasePaise: 75_000,
          commissionGstPaise: 13_501,
          commissionTotalPaise: 88_501,
        },
        payment: {
          type: 'COMMISSION',
          amountPaise: 88_501,
          razorpayOrderId: 'o',
          razorpayPaymentId: 'p',
          capturedAt: NOW,
        },
      }),
    );
    expect(s.tax).toMatchObject({ cgstPaise: 6_750, sgstPaise: 6_751 });
  });

  it('with GST 0 the document is an "Invoice" with no tax lines', () => {
    const b = computeBreakdown(10_000_00, 0);
    const s = buildInvoiceSnapshot(
      commissionInput({
        company: { ...COMPANY, gstin: null },
        deal: {
          shortId: 'ABCD2345',
          title: 'x',
          commissionBasePaise: b.commissionBasePaise,
          commissionGstPaise: 0,
          commissionTotalPaise: b.commissionTotalPaise,
        },
        payment: {
          type: 'COMMISSION',
          amountPaise: b.commissionTotalPaise,
          razorpayOrderId: 'o',
          razorpayPaymentId: 'p',
          capturedAt: NOW,
        },
      }),
    );
    expect(s).toMatchObject({
      title: 'Invoice',
      gstRateBps: 0,
      totalPaise: 75_000,
      tax: { kind: 'NONE', cgstPaise: 0, sgstPaise: 0, igstPaise: 0 },
      seller: { gstin: null },
    });
  });

  it('refuses a payment that does not match the frozen breakdown', () => {
    const input = commissionInput();
    expect(() =>
      buildInvoiceSnapshot({ ...input, payment: { ...input.payment, amountPaise: 1 } }),
    ).toThrow(/does not match/);
  });

  it('is valid against the shared snapshot schema', () => {
    expect(invoiceSnapshotSchema.safeParse(buildInvoiceSnapshot(commissionInput())).success).toBe(
      true,
    );
  });
});

describe('buildInvoiceSnapshot: receipts', () => {
  const receipt = (kind: 'ADVANCE_RECEIPT' | 'FINAL_RECEIPT', transferId: string | null) =>
    buildInvoiceSnapshot(
      commissionInput({
        kind,
        number: 'VS-R/2026-27/000001',
        payment: {
          type: kind === 'ADVANCE_RECEIPT' ? 'ADVANCE' : 'FINAL',
          amountPaise: 277_500,
          razorpayOrderId: 'order_2',
          razorpayPaymentId: 'pay_2',
          capturedAt: NOW,
        },
        creator: { name: 'Creator Name', username: 'creator_one', instagramUserId: 'ig_1' },
        transferId,
      }),
    );

  it('is a non-GST payment receipt naming the creator, the amount and the transfer', () => {
    const s = receipt('ADVANCE_RECEIPT', 'trf_1');
    expect(s).toMatchObject({
      title: 'Payment Receipt',
      totalPaise: 277_500,
      gstRateBps: 0,
      placeOfSupply: null,
      tax: { kind: 'NONE' },
      receipt: {
        creatorUsername: 'creator_one',
        creatorInstagramUserId: 'ig_1',
        transferId: 'trf_1',
      },
    });
    expect(s.lines[0]!.description).toContain('Advance payment to Creator Name');
    expect(receipt('FINAL_RECEIPT', null).lines[0]!.description).toContain('Final payment');
    expect(receipt('FINAL_RECEIPT', null).receipt?.transferId).toBeNull();
  });

  it('needs a creator', () => {
    expect(() =>
      buildInvoiceSnapshot(commissionInput({ kind: 'ADVANCE_RECEIPT', creator: null })),
    ).toThrow(/needs a creator/);
  });
});

describe('invoices issued by a real capture', () => {
  const server = setupServer();
  let razorpay: OrdersMockState;
  const gstEnv = buildTestEnv({ GST_RATE_BPS: '1800', COMPANY_GSTIN: '29AAAAA0000A1Z5' });
  const app = createApp(gstEnv, {
    now: () => NOW,
    razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} },
  });
  const call = api(app);

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'bypass' });
    await resetDb();
  });
  beforeEach(async () => {
    await truncateAll();
    razorpay = newOrdersState();
    server.use(...ordersHandlers(razorpay));
  });
  afterEach(() => server.resetHandlers());
  afterAll(async () => {
    server.close();
    await closeDb();
  });

  async function payCommission(billingState: string) {
    const brand = await brandWithBilling();
    await db
      .update(brandBilling)
      .set({ billingState })
      .where(eq(brandBilling.userId, brand.user.id));
    const creator = await creatorWithPayout();
    const b = computeBreakdown(10_000_00, 1800);
    const deal = await insertDeal(brand.user.id, 'CONFIRMED', {
      creatorId: creator.user.id,
      commissionBasePaise: b.commissionBasePaise,
      commissionGstPaise: b.commissionGstPaise,
      commissionTotalPaise: b.commissionTotalPaise,
      creatorAmountPaise: b.creatorAmountPaise,
      advancePaise: b.advancePaise,
      finalPaise: b.finalPaise,
    });
    const order = await call.send(
      'post',
      `/api/deals/${deal.id}/payments/commission/order`,
      brand.cookie,
      {},
    );
    const f = {
      orderId: order.body.orderId as string,
      amount: order.body.amountPaise as number,
      accountId: 'acc_x',
    };
    const paymentId = razorpayCaptured(razorpay, f, 'commission');
    const res = await call.send(
      'post',
      '/api/payments/verify',
      brand.cookie,
      verifyBody(f.orderId, paymentId),
    );
    expect(res.status).toBe(200);
    const [row] = await db.select().from(invoices).where(eq(invoices.dealId, deal.id));
    return { row: row!, snapshot: invoiceSnapshotSchema.parse(row!.snapshot) };
  }

  it('same state: a Tax Invoice with CGST and SGST, company details from env', async () => {
    const { snapshot, row } = await payCommission('Karnataka');
    expect(row.kind).toBe('COMMISSION_TAX_INVOICE');
    expect(snapshot).toMatchObject({
      title: 'Tax Invoice',
      number: row.number,
      tax: { kind: 'CGST_SGST', cgstPaise: 6_750, sgstPaise: 6_750 },
      seller: {
        legalName: gstEnv.COMPANY_LEGAL_NAME,
        address: gstEnv.COMPANY_ADDRESS,
        state: gstEnv.COMPANY_STATE,
        gstin: '29AAAAA0000A1Z5',
        sacCode: gstEnv.COMMISSION_SAC_CODE,
      },
      payment: { razorpayPaymentId: 'pay_mock1', capturedAt: NOW.toISOString() },
    });
  });

  it('another state: IGST', async () => {
    const { snapshot } = await payCommission('Maharashtra');
    expect(snapshot.tax).toMatchObject({
      kind: 'IGST',
      igstPaise: 13_500,
      cgstPaise: 0,
      sgstPaise: 0,
    });
  });
});
