import { describe, expect, it } from 'vitest';
import {
  financialYearOf,
  formatIst,
  formatIstDate,
  invoiceNumber,
  invoiceSeries,
  isSameState,
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
  it('formats tax invoices and receipts as SPEC 7.4 shows them', () => {
    expect(invoiceNumber('COMMISSION_TAX_INVOICE', '2026-27', 1)).toBe('VS/2026-27/000001');
    expect(invoiceNumber('ADVANCE_RECEIPT', '2026-27', 12)).toBe('VS-R/2026-27/000012');
    expect(invoiceNumber('FINAL_RECEIPT', '2026-27', 13)).toBe('VS-R/2026-27/000013');
    expect(invoiceNumber('COMMISSION_TAX_INVOICE', '2026-27', 1234567)).toBe('VS/2026-27/1234567');
  });

  it('counts both receipt kinds on one counter and the invoice on its own', () => {
    expect(invoiceSeries('ADVANCE_RECEIPT').counterKind).toBe('ADVANCE_RECEIPT');
    expect(invoiceSeries('FINAL_RECEIPT').counterKind).toBe('ADVANCE_RECEIPT');
    expect(invoiceSeries('COMMISSION_TAX_INVOICE').counterKind).toBe('COMMISSION_TAX_INVOICE');
  });

  it('rejects a sequence that is not a positive integer', () => {
    expect(() => invoiceNumber('ADVANCE_RECEIPT', '2026-27', 0)).toThrow();
    expect(() => invoiceNumber('ADVANCE_RECEIPT', '2026-27', 1.5)).toThrow();
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
