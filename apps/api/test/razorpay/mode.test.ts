import { describe, expect, it } from 'vitest';
import { razorpayModeFromKeyId } from '../../src/razorpay/mode.js';

describe('razorpayModeFromKeyId (SPEC 7.1)', () => {
  it('detects test and live mode from the key id prefix', () => {
    expect(razorpayModeFromKeyId('rzp_test_abc123')).toBe('test');
    expect(razorpayModeFromKeyId('rzp_live_abc123')).toBe('live');
  });

  it('refuses anything else', () => {
    expect(() => razorpayModeFromKeyId('key_abc')).toThrow();
    expect(() => razorpayModeFromKeyId('')).toThrow();
  });
});
