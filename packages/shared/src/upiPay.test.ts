import { describe, expect, it } from 'vitest';
import { buildUpiPay, upiPayUri } from './upiPay.js';

describe('buildUpiPay', () => {
  it('uses the amount with two decimals and names the deal and stage', () => {
    expect(
      buildUpiPay({
        vpa: 'raj.kumar@okaxis',
        name: 'Raj Kumar',
        amountPaise: 273450,
        dealShortId: 'ABCD2345',
        stage: 'ADVANCE',
      }),
    ).toEqual({
      pa: 'raj.kumar@okaxis',
      pn: 'Raj Kumar',
      am: '2734.50',
      cu: 'INR',
      tn: 'ValueSkins ABCD2345 advance',
    });
    expect(
      buildUpiPay({
        vpa: 'a@ybl',
        name: 'A',
        amountPaise: 638050,
        dealShortId: 'X',
        stage: 'FINAL',
      }).tn,
    ).toBe('ValueSkins X final');
  });
});

describe('buildUpiPay for the minimum budget (₹886: ₹0.30 and ₹0.70 to the creator)', () => {
  it.each([
    [30, 'ADVANCE', '0.30', 'advance'],
    [70, 'FINAL', '0.70', 'final'],
    [88650, 'FINAL', '886.50', 'final'],
  ] as const)('%d paise is am=%s', (amountPaise, stage, am, word) => {
    const fields = buildUpiPay({
      vpa: 'raj@okaxis',
      name: 'Raj',
      amountPaise,
      dealShortId: 'ABCD2345',
      stage,
    });
    expect(fields.am).toBe(am);
    expect(fields.tn).toBe(`ValueSkins ABCD2345 ${word}`);
    expect(upiPayUri(fields)).toContain(`&am=${am}&cu=INR&`);
  });
});

describe('upiPayUri', () => {
  it('encodes every value and keeps the fields in order', () => {
    const uri = upiPayUri({
      pa: 'raj@okaxis',
      pn: "Raj D'Souza & Co",
      am: '10.00',
      cu: 'INR',
      tn: 'ValueSkins AB advance',
    });
    expect(uri).toBe(
      "upi://pay?pa=raj%40okaxis&pn=Raj%20D'Souza%20%26%20Co&am=10.00&cu=INR&tn=ValueSkins%20AB%20advance",
    );
  });
});
