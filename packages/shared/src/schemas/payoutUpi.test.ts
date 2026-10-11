import { describe, expect, it } from 'vitest';
import {
  INVALID_UPI_ID,
  INVALID_UPI_NAME,
  NAME_LOOKS_LIKE_BANK_DETAILS,
  NOT_A_UPI_ID_BANK_ACCOUNT,
  NOT_A_UPI_ID_IFSC,
  NOT_A_UPI_ID_PAN,
  mePayoutUpiSchema,
} from './payoutUpi.js';

const valid = { vpa: 'raj.kumar@okhdfcbank', name: 'Raj Kumar', consent: true };

const messages = (input: unknown) => {
  const result = mePayoutUpiSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('mePayoutUpiSchema', () => {
  it('accepts a UPI ID, a name and consent', () => {
    expect(mePayoutUpiSchema.parse(valid)).toEqual(valid);
  });

  it('trims, and stores the UPI ID in lower case', () => {
    expect(
      mePayoutUpiSchema.parse({
        vpa: '  Raj.Kumar@OkHdfcBank ',
        name: '  Raj Kumar ',
        consent: true,
      }),
    ).toEqual(valid);
  });

  it('refuses a bank account number, a PAN and an IFSC code with their own message', () => {
    expect(messages({ ...valid, vpa: '123456789012' })).toEqual([
      `vpa: ${NOT_A_UPI_ID_BANK_ACCOUNT}`,
    ]);
    expect(messages({ ...valid, vpa: '1234 5678 9012 34' })).toEqual([
      `vpa: ${NOT_A_UPI_ID_BANK_ACCOUNT}`,
    ]);
    expect(messages({ ...valid, vpa: 'ABCPE1234F' })).toEqual([`vpa: ${NOT_A_UPI_ID_PAN}`]);
    expect(messages({ ...valid, vpa: 'hdfc0001234' })).toEqual([`vpa: ${NOT_A_UPI_ID_IFSC}`]);
  });

  it('refuses anything else that is not shaped like a UPI ID', () => {
    for (const vpa of ['', 'raj', 'raj@', '@bank', 'raj@bank1', 'r@bank', 'raj kumar@bank']) {
      expect(messages({ ...valid, vpa }), vpa).toEqual([`vpa: ${INVALID_UPI_ID}`]);
    }
  });

  it('never repeats what was typed in a message', () => {
    for (const vpa of ['123456789012', 'ABCPE1234F', 'HDFC0001234', 'not a upi id 98765']) {
      expect(JSON.stringify(messages({ ...valid, vpa }))).not.toContain(vpa);
    }
  });

  it('takes a name as the UPI app shows it, in any script', () => {
    for (const name of ['Raj Kumar', "D'Souza", 'Anne-Marie K.', 'राज कुमार']) {
      expect(mePayoutUpiSchema.safeParse({ ...valid, name }).success, name).toBe(true);
    }
  });

  it('refuses a name that is a number or a code, or has the wrong characters or length', () => {
    expect(messages({ ...valid, name: '123456789012' })).toEqual([
      `name: ${NAME_LOOKS_LIKE_BANK_DETAILS}`,
    ]);
    expect(messages({ ...valid, name: 'ABCPE1234F' })).toEqual([
      `name: ${NAME_LOOKS_LIKE_BANK_DETAILS}`,
    ]);
    expect(messages({ ...valid, name: 'HDFC0001234' })).toEqual([
      `name: ${NAME_LOOKS_LIKE_BANK_DETAILS}`,
    ]);
    for (const name of ['', 'R', 'Raj <b>', 'Raj 2', 'x'.repeat(81)]) {
      expect(messages({ ...valid, name }), name).toEqual([`name: ${INVALID_UPI_NAME}`]);
    }
  });

  it('needs consent to be exactly true', () => {
    expect(mePayoutUpiSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
    expect(mePayoutUpiSchema.safeParse({ ...valid, consent: 'true' }).success).toBe(false);
    expect(mePayoutUpiSchema.safeParse({ vpa: valid.vpa, name: valid.name }).success).toBe(false);
  });

  it('rejects unknown fields, including the old bank fields', () => {
    for (const extra of [
      { pan: 'ABCPE1234F' },
      { ifsc: 'HDFC0001234' },
      { bankAccountNumber: '1' },
    ]) {
      expect(mePayoutUpiSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });
});
