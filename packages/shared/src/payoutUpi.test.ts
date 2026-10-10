import { describe, expect, it } from 'vitest';
import {
  UPI_VPA_REGEX,
  looksLikeBankAccount,
  looksLikeIfsc,
  looksLikePan,
  maskVpa,
} from './payoutUpi.js';

describe('UPI_VPA_REGEX', () => {
  it.each(['cr@okhdfcbank', 'raj.kumar-1_x@ybl', 'AB@Paytm', 'a1@ok'])('accepts %s', (vpa) => {
    expect(UPI_VPA_REGEX.test(vpa)).toBe(true);
  });

  it.each([
    'noat',
    'a@bank',
    'x@bank',
    '@bank',
    'name@',
    'name@bank1',
    'na me@bank',
    `${'a'.repeat(65)}@bank`,
    'name@' + 'b'.repeat(33),
    '1234567890123456',
    'ABCDE1234F',
    'HDFC0001234',
  ])('rejects %s', (vpa) => {
    expect(UPI_VPA_REGEX.test(vpa)).toBe(false);
  });
});

describe('shapes that are not a UPI ID', () => {
  it('spots a bank account number however it is spaced', () => {
    expect(looksLikeBankAccount('123456789012')).toBe(true);
    expect(looksLikeBankAccount('1234 5678 9012')).toBe(true);
    expect(looksLikeBankAccount('12345678')).toBe(false);
    expect(looksLikeBankAccount('1'.repeat(19))).toBe(false);
    expect(looksLikeBankAccount('raj@okaxis')).toBe(false);
  });

  it('spots a PAN and an IFSC code', () => {
    expect(looksLikePan('ABCPE1234F')).toBe(true);
    expect(looksLikePan('abcpe1234f')).toBe(true);
    expect(looksLikePan('raj@okaxis')).toBe(false);
    expect(looksLikeIfsc('HDFC0001234')).toBe(true);
    expect(looksLikeIfsc('hdfc0001234')).toBe(true);
    expect(looksLikeIfsc('HDFC1001234')).toBe(false);
  });
});

describe('maskVpa', () => {
  it('keeps two characters and the handle', () => {
    expect(maskVpa('creator@okhdfcbank')).toBe('cr•••@okhdfcbank');
  });

  it('keeps one character when the part before the @ has only two', () => {
    expect(maskVpa('ab@ybl')).toBe('a•••@ybl');
  });

  it('never returns a malformed value as it was', () => {
    expect(maskVpa('no-at-sign')).toBe('•••');
    expect(maskVpa('@x')).toBe('•••');
  });

  it('never contains the whole local part of a normal ID', () => {
    for (const vpa of ['raj.kumar@okaxis', 'abc@ybl', 'ab@ybl']) {
      expect(maskVpa(vpa)).not.toContain(vpa.split('@')[0]);
    }
  });
});
