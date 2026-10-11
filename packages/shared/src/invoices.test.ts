import { describe, expect, it } from 'vitest';
import {
  financialYearOf,
  formatIst,
  formatIstDate,
  invoiceNumber,
  invoiceSeries,
  invoiceSnapshotSchema,
  isSameState,
  paymentRecordSnapshotSchema,
} from './invoices.js';

describe('financialYearOf (April to March, in IST)', () => {
  it.each([
    ['2026-10-09T04:30:00Z', '2026-27'],
    ['2027-03-31T18:29:59Z', '2026-27'], // 23:59:59 IST on 31 March
    ['2027-03-31T18:30:00Z', '2027-28'], // 00:00 IST on 1 April
    ['2026-04-01T00:00:00Z', '2026-27'],
    ['2026-03-31T18:30:00Z', '2026-27'], // 1 April 2026 IST
    ['2026-03-31T18:29:59Z', '2025-26'],
    ['2099-12-31T00:00:00Z', '2099-00'],
  ])('%s is FY %s', (iso, expected) => {
    expect(financialYearOf(new Date(iso))).toBe(expected);
  });
});

describe('invoiceNumber and invoiceSeries', () => {
  it('formats tax invoices and payment records as SPEC 7.4 shows them', () => {
    expect(invoiceNumber('COMMISSION_TAX_INVOICE', '2026-27', 1)).toBe('VS/2026-27/000001');
    expect(invoiceNumber('ADVANCE_PAYMENT_RECORD', '2026-27', 12)).toBe('VS-PR/2026-27/000012');
    expect(invoiceNumber('FINAL_PAYMENT_RECORD', '2026-27', 13)).toBe('VS-PR/2026-27/000013');
    expect(invoiceNumber('COMMISSION_TAX_INVOICE', '2026-27', 1234567)).toBe('VS/2026-27/1234567');
  });

  it('counts both payment record kinds on one counter and the invoice on its own', () => {
    expect(invoiceSeries('ADVANCE_PAYMENT_RECORD').counterKind).toBe('ADVANCE_PAYMENT_RECORD');
    expect(invoiceSeries('FINAL_PAYMENT_RECORD').counterKind).toBe('ADVANCE_PAYMENT_RECORD');
    expect(invoiceSeries('COMMISSION_TAX_INVOICE').counterKind).toBe('COMMISSION_TAX_INVOICE');
  });

  it('rejects a sequence that is not a positive integer', () => {
    expect(() => invoiceNumber('ADVANCE_PAYMENT_RECORD', '2026-27', 0)).toThrow();
    expect(() => invoiceNumber('ADVANCE_PAYMENT_RECORD', '2026-27', 1.5)).toThrow();
  });
});

describe('isSameState', () => {
  it('ignores case and spacing', () => {
    expect(isSameState('Karnataka', 'karnataka')).toBe(true);
    expect(isSameState('  Tamil   Nadu ', 'tamil nadu')).toBe(true);
  });
  it('is false for different states and for blanks', () => {
    expect(isSameState('Karnataka', 'Maharashtra')).toBe(false);
    expect(isSameState('', '')).toBe(false);
  });
});

describe('IST formatting', () => {
  it('formats a date and time in IST', () => {
    expect(formatIst(new Date('2026-10-09T10:00:00Z'))).toBe('9 Oct 2026, 15:30 IST');
    expect(formatIst(new Date('2026-12-31T20:00:00Z'))).toBe('1 Jan 2027, 01:30 IST');
    expect(formatIstDate(new Date('2026-10-09T20:00:00Z'))).toBe('10 Oct 2026');
  });
});

describe('invoiceSnapshotSchema', () => {
  const seller = {
    legalName: 'Valueskins Private Limited',
    address: '1 MG Road',
    state: 'Karnataka',
    gstin: null,
    sacCode: null,
  };
  const record = {
    version: 1,
    kind: 'ADVANCE_PAYMENT_RECORD',
    number: 'VS-PR/2026-27/000001',
    financialYear: '2026-27',
    issuedAt: '2026-10-09T04:30:00.000Z',
    title: 'Payment Record',
    seller,
    brandBillingName: 'Brand Pvt Ltd',
    deal: { shortId: 'ABCD2345', title: 'Deal' },
    stage: 'ADVANCE',
    amountPaise: 273450,
    reference: 'UTR123456789',
    note: null,
    payee: { name: 'Raj Kumar', maskedVpa: 'ra•••@okaxis', username: 'raj', instagramUserId: null },
    recordedAt: '2026-10-09T03:00:00.000Z',
    confirmedAt: '2026-10-09T04:30:00.000Z',
  };

  it('reads a payment record and picks the variant by kind', () => {
    const parsed = invoiceSnapshotSchema.parse(record);
    expect(parsed.kind).toBe('ADVANCE_PAYMENT_RECORD');
  });

  it('refuses a payment record that carries the old receipt kinds or a missing reference', () => {
    expect(invoiceSnapshotSchema.safeParse({ ...record, kind: 'ADVANCE_RECEIPT' }).success).toBe(
      false,
    );
    const withoutReference: Record<string, unknown> = { ...record };
    delete withoutReference.reference;
    expect(invoiceSnapshotSchema.safeParse(withoutReference).success).toBe(false);
  });

  it('has no place for a full UPI ID, a Razorpay id or a transfer', () => {
    const keys = Object.keys(paymentRecordSnapshotSchema.shape);
    for (const key of ['payment', 'receipt', 'tax', 'paidToVpa', 'vpa', 'transferId']) {
      expect(keys).not.toContain(key);
    }
  });
});
