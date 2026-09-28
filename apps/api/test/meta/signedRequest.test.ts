import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySignedRequest } from '../../src/meta/signedRequest.js';

const APP_SECRET = 'test-meta-app-secret';

function buildSignedRequest(payload: object, secret = APP_SECRET): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${sig}.${encodedPayload}`;
}

describe('verifySignedRequest', () => {
  it('decodes a valid signed_request', () => {
    const signed = buildSignedRequest({
      algorithm: 'HMAC-SHA256',
      issued_at: Math.floor(Date.now() / 1000),
      user_id: 'ig-user-123',
    });

    const payload = verifySignedRequest(signed, APP_SECRET);
    expect(payload?.user_id).toBe('ig-user-123');
  });

  it('rejects a signature signed with the wrong secret', () => {
    const signed = buildSignedRequest(
      { algorithm: 'HMAC-SHA256', issued_at: 1, user_id: 'ig-user-123' },
      'wrong-secret',
    );
    expect(verifySignedRequest(signed, APP_SECRET)).toBeNull();
  });

  it('rejects a tampered payload (signature no longer matches)', () => {
    const signed = buildSignedRequest({
      algorithm: 'HMAC-SHA256',
      issued_at: 1,
      user_id: 'ig-user-123',
    });
    const [sig] = signed.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ algorithm: 'HMAC-SHA256', issued_at: 1, user_id: 'someone-else' }),
    ).toString('base64url');

    expect(verifySignedRequest(`${sig}.${tamperedPayload}`, APP_SECRET)).toBeNull();
  });

  it('rejects malformed input with no separator', () => {
    expect(verifySignedRequest('not-a-signed-request', APP_SECRET)).toBeNull();
  });

  it('rejects a payload with the wrong algorithm', () => {
    const signed = buildSignedRequest({
      algorithm: 'MD5',
      issued_at: 1,
      user_id: 'ig-user-123',
    });
    expect(verifySignedRequest(signed, APP_SECRET)).toBeNull();
  });

  it('rejects a payload missing user_id', () => {
    const signed = buildSignedRequest({ algorithm: 'HMAC-SHA256', issued_at: 1 });
    expect(verifySignedRequest(signed, APP_SECRET)).toBeNull();
  });
});
