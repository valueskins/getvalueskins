import { describe, expect, it } from 'vitest';
import { directPaymentNotReceivedSchema, directPaymentRecordSchema } from './directPayment.js';

const valid = { stage: 'ADVANCE', reference: 'UTR123456789' };

describe('directPaymentRecordSchema', () => {
  it('takes a stage, a reference and an optional note', () => {
    expect(directPaymentRecordSchema.parse(valid)).toEqual(valid);
    expect(
      directPaymentRecordSchema.parse({
        ...valid,
        reference: ' 4312/ab-12 ',
        note: ' paid at noon ',
      }),
    ).toEqual({ stage: 'ADVANCE', reference: '4312/ab-12', note: 'paid at noon' });
  });

  it.each(['12345', 'x'.repeat(41), 'abc def 123', 'ref_12345', 'ref#12345', ''])(
    'refuses the reference %j',
    (reference) => {
      expect(directPaymentRecordSchema.safeParse({ ...valid, reference }).success).toBe(false);
    },
  );

  it('accepts 6 and 40 characters', () => {
    expect(
      directPaymentRecordSchema.safeParse({ ...valid, reference: 'a'.repeat(6) }).success,
    ).toBe(true);
    expect(
      directPaymentRecordSchema.safeParse({ ...valid, reference: 'a'.repeat(40) }).success,
    ).toBe(true);
  });

  it('refuses another stage, a long note and any client amount', () => {
    expect(directPaymentRecordSchema.safeParse({ ...valid, stage: 'COMMISSION' }).success).toBe(
      false,
    );
    expect(directPaymentRecordSchema.safeParse({ ...valid, note: 'x'.repeat(501) }).success).toBe(
      false,
    );
    for (const extra of [{ amount: 1 }, { amountPaise: 1 }, { paidToVpa: 'a@b' }]) {
      expect(directPaymentRecordSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });
});

describe('directPaymentNotReceivedSchema', () => {
  it('needs a reason', () => {
    expect(directPaymentNotReceivedSchema.safeParse({ reason: 'Nothing arrived' }).success).toBe(
      true,
    );
    expect(directPaymentNotReceivedSchema.safeParse({}).success).toBe(false);
    expect(directPaymentNotReceivedSchema.safeParse({ reason: '  ' }).success).toBe(false);
    expect(directPaymentNotReceivedSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });
});
