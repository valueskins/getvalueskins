import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SignedRequestPayload {
  algorithm: string;
  issued_at: number;
  user_id: string;
}

/** Verifies Meta's `signed_request` (deauthorize / data-deletion callbacks):
 * `<base64url_sig>.<base64url_payload>`, HMAC-SHA256 over the raw encoded
 * payload string with the app secret. Returns null on any failure. */
export function verifySignedRequest(
  signedRequest: string,
  appSecret: string,
): SignedRequestPayload | null {
  const parts = signedRequest.split('.');
  if (parts.length !== 2) return null;
  const [encodedSig, encodedPayload] = parts as [string, string];

  const sig = Buffer.from(encodedSig, 'base64url');
  const expectedSig = createHmac('sha256', appSecret).update(encodedPayload).digest();
  if (sig.length !== expectedSig.length || !timingSafeEqual(sig, expectedSig)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (
      typeof payload !== 'object' ||
      payload === null ||
      payload.algorithm !== 'HMAC-SHA256' ||
      typeof payload.user_id !== 'string'
    ) {
      return null;
    }
    return payload as SignedRequestPayload;
  } catch {
    return null;
  }
}

/**
 * Meta's docs do not say whether Instagram Login callbacks are signed with the
 * Instagram app secret or the Meta app secret, so accept either. Both are
 * secrets only Meta and this server know, so this does not weaken verification.
 */
export function verifySignedRequestWithAnySecret(
  signedRequest: string,
  appSecrets: string[],
): SignedRequestPayload | null {
  for (const secret of appSecrets) {
    const payload = verifySignedRequest(signedRequest, secret);
    if (payload) return payload;
  }
  return null;
}
