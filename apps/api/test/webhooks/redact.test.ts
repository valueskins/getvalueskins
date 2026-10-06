import { describe, expect, it } from 'vitest';
import { redactWebhookPayload } from '../../src/webhooks/redact.js';

describe('redactWebhookPayload', () => {
  it('drops PAN, KYC, phone and legal info at any depth', () => {
    const redacted = redactWebhookPayload({
      event: 'x',
      payload: {
        entity: {
          pan: 'ABCPE1234F',
          legal_info: { pan: 'ABCPE1234F', gst: '29ABCDE1234F1Z5' },
          kyc: { pan: 'ABCPE1234F' },
          phone: { primary: '9876543210' },
          keep: 'me',
        },
      },
    });

    expect(redacted).toEqual({ event: 'x', payload: { entity: { keep: 'me' } } });
  });

  it('reduces account numbers to the last 4 digits', () => {
    const redacted = redactWebhookPayload({
      active_configuration: {
        settlements: { account_number: '123456789012', ifsc_code: 'HDFC0001234' },
      },
    });

    expect(redacted).toEqual({
      active_configuration: {
        settlements: { account_number: '****9012', ifsc_code: 'HDFC0001234' },
      },
    });
  });

  it('goes through arrays and leaves other values alone', () => {
    expect(
      redactWebhookPayload({ list: [{ account_number: '99887766' }, 5, 'text', null] }),
    ).toEqual({ list: [{ account_number: '****7766' }, 5, 'text', null] });
  });
});
