import { and, eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { deals, invoiceCounters, invoices } from '../../src/db/schema/index.js';
import { nextInvoiceNumber } from '../../src/invoices/numbering.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, http as api } from '../helpers/deals.js';
import { verifyBody } from '../helpers/payments.js';
import { buildTestEnv } from '../testEnv.js';
import {
  confirmPayment,
  dealWithOrder,
  razorpayCaptured,
  recordPayment,
  type PaymentKind,
} from '../payments/fixture.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';

const env = buildTestEnv();
let clock = NOW;
const app = createApp(env, {
  now: () => clock,
  razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} },
});
const call = api(app);
const server = setupServer();
let razorpay: OrdersMockState;

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
beforeEach(async () => {
  clock = NOW;
  await truncateAll();
  razorpay = newOrdersState();
  server.use(...ordersHandlers(razorpay));
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await closeDb();
});

let paymentCounter = 0;
/** A deal with an order, paid through verify. */
async function paid(kind: PaymentKind = 'commission') {
  const f = await dealWithOrder(call, kind);
  paymentCounter += 1;
  const paymentId = razorpayCaptured(razorpay, f, kind, { paymentId: `pay_n${paymentCounter}` });
  return {
    f,
    paymentId,
    verify: () =>
      call.send('post', '/api/payments/verify', f.brand.cookie, verifyBody(f.orderId, paymentId)),
  };
}

const allInvoices = () => db.select().from(invoices);

/** A COMMISSION_PAID deal whose brand recorded an advance payment, waiting for the creator. */
async function confirmableAdvance() {
  const f = await dealWithOrder(call, 'commission');
  await db.update(deals).set({ status: 'COMMISSION_PAID' }).where(eq(deals.id, f.deal.id));
  const recorded = await recordPayment(call, f.brand, f.deal.id, 'ADVANCE');
  if (recorded.status !== 201) throw new Error(`record failed: ${JSON.stringify(recorded.body)}`);
  return { ...f, recordId: recorded.body.directPayment.id as string };
}

/** Records and confirms a payment of one stage on a deal put in the right status; returns the confirm response. */
async function paidDirect(stage: 'ADVANCE' | 'FINAL') {
  const f = await dealWithOrder(call, 'commission');
  await db
    .update(deals)
    .set({ status: stage === 'ADVANCE' ? 'COMMISSION_PAID' : 'APPROVED' })
    .where(eq(deals.id, f.deal.id));
  const recorded = await recordPayment(call, f.brand, f.deal.id, stage);
  return confirmPayment(call, f.creator, recorded.body.directPayment.id as string);
}

describe('invoice numbers are gapless and unique under concurrency', () => {
  it('six simultaneous commission payments get exactly 1 to 6', async () => {
    const payments = await Promise.all(Array.from({ length: 6 }, () => paid('commission')));
    const results = await Promise.all(payments.map((p) => p.verify()));
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));

    const rows = await allInvoices();
    expect(rows.map((r) => r.sequence).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(rows.map((r) => r.number)).size).toBe(6);
    expect(rows.every((r) => /^VS\/2026-27\/00000[1-6]$/.test(r.number))).toBe(true);
    expect(
      rows.every((r) => r.kind === 'COMMISSION_TAX_INVOICE' && r.financialYear === '2026-27'),
    ).toBe(true);
    const [counter] = await db.select().from(invoiceCounters);
    expect(counter).toMatchObject({ kind: 'COMMISSION_TAX_INVOICE', lastSequence: 6 });
  });

  it('direct numbering calls from many transactions never repeat or skip', async () => {
    const numbers = await Promise.all(
      Array.from({ length: 20 }, () =>
        db.transaction((tx) => nextInvoiceNumber(tx, 'ADVANCE_PAYMENT_RECORD', '2026-27')),
      ),
    );
    expect(numbers.map((n) => n.sequence).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('a transaction that rolls back leaves no hole', async () => {
    await db.transaction((tx) => nextInvoiceNumber(tx, 'COMMISSION_TAX_INVOICE', '2026-27'));
    await expect(
      db.transaction(async (tx) => {
        await nextInvoiceNumber(tx, 'COMMISSION_TAX_INVOICE', '2026-27');
        throw new Error('the capture failed after numbering');
      }),
    ).rejects.toThrow('the capture failed');
    const next = await db.transaction((tx) =>
      nextInvoiceNumber(tx, 'COMMISSION_TAX_INVOICE', '2026-27'),
    );
    expect(next).toEqual({ number: 'VS/2026-27/000002', sequence: 2 });
  });
});

describe('series', () => {
  it('advance and final payment records share one VS-PR series; tax invoices count on their own', async () => {
    const commission = await paid('commission');
    await commission.verify();
    // Two more deals, paid by direct UPI payments the creators confirm.
    const advance = await paidDirect('ADVANCE');
    const final = await paidDirect('FINAL');

    const rows = await allInvoices();
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.number]));
    expect(byKind).toEqual({
      COMMISSION_TAX_INVOICE: 'VS/2026-27/000001',
      ADVANCE_PAYMENT_RECORD: 'VS-PR/2026-27/000001',
      FINAL_PAYMENT_RECORD: 'VS-PR/2026-27/000002',
    });
    expect(advance.status).toBe(200);
    expect(final.status).toBe(200);
    const counters = await db.select().from(invoiceCounters);
    expect(counters.map((c) => [c.kind, c.lastSequence]).sort()).toEqual([
      ['ADVANCE_PAYMENT_RECORD', 2],
      ['COMMISSION_TAX_INVOICE', 1],
    ]);
  });

  it('eight payment records confirmed at once get exactly 1 to 8, with no gap', async () => {
    const deals = await Promise.all(Array.from({ length: 8 }, () => confirmableAdvance()));
    const results = await Promise.all(
      deals.map((d) => confirmPayment(call, d.creator, d.recordId)),
    );
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
    const numbers = (await allInvoices())
      .filter((r) => r.kind === 'ADVANCE_PAYMENT_RECORD')
      .map((r) => r.sequence)
      .sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('starts a new count on 1 April IST and keeps counting inside the year', async () => {
    clock = new Date('2027-03-31T18:29:59Z'); // 23:59:59 IST, last second of 2026-27
    await (await paid('commission')).verify();
    clock = new Date('2027-03-31T18:30:00Z'); // 1 April IST
    await (await paid('commission')).verify();
    await (await paid('commission')).verify();

    const rows = (await allInvoices()).sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime());
    expect(rows.map((r) => r.number)).toEqual([
      'VS/2026-27/000001',
      'VS/2027-28/000001',
      'VS/2027-28/000002',
    ]);
  });
});

describe('one invoice per payment', () => {
  it('verify and webhook racing issue a single invoice', async () => {
    const p = await paid('commission');
    await Promise.all([p.verify(), p.verify(), p.verify()]);
    expect(await allInvoices()).toHaveLength(1);
  });

  it('two confirms of one direct payment issue a single payment record', async () => {
    const d = await confirmableAdvance();
    const results = await Promise.all([
      confirmPayment(call, d.creator, d.recordId),
      confirmPayment(call, d.creator, d.recordId),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await allInvoices()).toHaveLength(1);
  });

  it('the database refuses a second payment record for the same direct payment', async () => {
    const d = await confirmableAdvance();
    await confirmPayment(call, d.creator, d.recordId);
    const [existing] = await allInvoices();
    await expect(
      db
        .insert(invoices)
        .values({ ...existing!, id: undefined, number: 'VS-PR/2026-27/000099', sequence: 99 }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('an invoice belongs to exactly one source, and the kind decides which', async () => {
    const d = await confirmableAdvance();
    await confirmPayment(call, d.creator, d.recordId);
    const [record] = await allInvoices();
    const base = { ...record!, id: undefined, number: 'X/1', sequence: 1 };
    const failure = async (values: object) =>
      db
        .insert(invoices)
        .values(values as typeof base)
        .then(() => null)
        .catch((error) => (error as { cause?: { code?: string } }).cause?.code ?? 'unknown');
    // Neither source, and both sources.
    expect(await failure({ ...base, directPaymentId: null })).toBe('23514');
    const commission = await paid('commission');
    await commission.verify();
    const invoice = (await allInvoices()).find((r) => r.kind === 'COMMISSION_TAX_INVOICE')!;
    expect(
      await failure({
        ...base,
        number: 'X/2',
        paymentId: invoice.paymentId,
        directPaymentId: record!.directPaymentId,
      }),
    ).toBe('23514');
    // A payment record kind on a Razorpay payment.
    expect(
      await failure({
        ...base,
        number: 'X/3',
        paymentId: invoice.paymentId,
        directPaymentId: null,
      }),
    ).toBe('23514');
  });

  it('the database refuses a second invoice for the same payment', async () => {
    const p = await paid('commission');
    await p.verify();
    const [existing] = await allInvoices();
    await expect(
      db
        .insert(invoices)
        .values({ ...existing!, id: undefined, number: 'VS/2026-27/000099', sequence: 99 }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    expect(
      await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.paymentId, existing!.paymentId as string))),
    ).toHaveLength(1);
  });
});
