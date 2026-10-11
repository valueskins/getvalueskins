import { computeBreakdown, invoiceSnapshotSchema } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { brandBilling, invoices } from '../../src/db/schema/index.js';
import {
  buildInvoiceSnapshot,
  buildPaymentRecordSnapshot,
  type CommissionSnapshotInput,
} from '../../src/invoices/snapshot.js';
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

function commissionInput(
  overrides: Partial<CommissionSnapshotInput> = {},
): CommissionSnapshotInput {
  const b = computeBreakdown(10_000_00, 1800);
  return {
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
      amountPaise: b.commissionTotalPaise,
      razorpayOrderId: 'order_1',
      razorpayPaymentId: 'pay_1',
      capturedAt: NOW,
    },
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

describe('buildPaymentRecordSnapshot: the advance and final payment records', () => {
  const record = (
    kind: 'ADVANCE_PAYMENT_RECORD' | 'FINAL_PAYMENT_RECORD',
    note: string | null = null,
  ) =>
    buildPaymentRecordSnapshot({
      kind,
      number: 'VS-PR/2026-27/000001',
      financialYear: '2026-27',
      issuedAt: NOW,
      company: COMPANY,
      deal: { shortId: 'ABCD2345', title: 'Summer reels' },
      brandBillingName: 'Brand Pvt Ltd',
      stage: kind === 'ADVANCE_PAYMENT_RECORD' ? 'ADVANCE' : 'FINAL',
      amountPaise: 277_500,
      reference: 'UTR123456789',
      note,
      payee: {
        name: 'Creator Name',
        maskedVpa: 'cr\u2022\u2022\u2022@okaxis',
        username: 'creator_one',
        instagramUserId: 'ig_1',
      },
      recordedAt: new Date('2026-10-09T03:00:00Z'),
      confirmedAt: NOW,
    });

  it('names the creator, the amount, the reference and both times, with a masked UPI ID', () => {
    const s = record('ADVANCE_PAYMENT_RECORD', 'paid at noon');
    expect(s).toMatchObject({
      kind: 'ADVANCE_PAYMENT_RECORD',
      title: 'Payment Record',
      stage: 'ADVANCE',
      amountPaise: 277_500,
      reference: 'UTR123456789',
      note: 'paid at noon',
      payee: {
        username: 'creator_one',
        instagramUserId: 'ig_1',
        maskedVpa: 'cr\u2022\u2022\u2022@okaxis',
      },
      recordedAt: '2026-10-09T03:00:00.000Z',
      confirmedAt: NOW.toISOString(),
    });
    expect(record('FINAL_PAYMENT_RECORD').stage).toBe('FINAL');
    expect(record('FINAL_PAYMENT_RECORD').note).toBeNull();
  });

  it('has no tax, no Razorpay id and no transfer, and is valid against the shared schema', () => {
    const s = record('FINAL_PAYMENT_RECORD');
    expect(invoiceSnapshotSchema.safeParse(s).success).toBe(true);
    for (const key of ['tax', 'payment', 'receipt', 'gstRateBps', 'placeOfSupply']) {
      expect(s).not.toHaveProperty(key);
    }
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
