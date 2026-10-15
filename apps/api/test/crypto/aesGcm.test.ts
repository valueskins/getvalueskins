import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptFromBase64, encryptToBase64 } from '../../src/crypto/aesGcm.js';

/** Changes one byte of a base64url part, so the decoded bytes always differ. */
function flipFirstByte(part: string): string {
  const bytes = Buffer.from(part, 'base64url');
  bytes[0] = bytes[0]! ^ 0xff;
  return bytes.toString('base64url');
}

describe('aesGcm', () => {
  const key = randomBytes(32);

  it('round trips a plaintext string', () => {
    const encrypted = encryptToBase64('super-secret-token', key);
    expect(decryptFromBase64(encrypted, key)).toBe('super-secret-token');
  });

  it('produces a different ciphertext (and IV) on each call for the same plaintext', () => {
    const a = encryptToBase64('same plaintext', key);
    const b = encryptToBase64('same plaintext', key);
    expect(a).not.toBe(b);
  });

  it('throws when the auth tag is tampered with', () => {
    const encrypted = encryptToBase64('super-secret-token', key);
    const [iv, authTag, ciphertext] = encrypted.split('.');
    const tampered = `${iv}.${flipFirstByte(authTag!)}.${ciphertext}`;
    expect(() => decryptFromBase64(tampered, key)).toThrow();
  });

  it('throws when the ciphertext is tampered with', () => {
    const encrypted = encryptToBase64('super-secret-token', key);
    const [iv, authTag, ciphertext] = encrypted.split('.');
    const tampered = `${iv}.${authTag}.${flipFirstByte(ciphertext!)}`;
    expect(() => decryptFromBase64(tampered, key)).toThrow();
  });

  it('detects tampering on every try, not only most of them', () => {
    // Overwriting the last base64url characters is not enough: the last
    // character of a 16-byte tag carries only 2 bits, so about 1 try in 256
    // decoded to the same tag and the old tamper test passed by chance.
    for (let i = 0; i < 500; i += 1) {
      const [iv, authTag, ciphertext] = encryptToBase64('super-secret-token', key).split('.');
      expect(() =>
        decryptFromBase64(`${iv}.${flipFirstByte(authTag!)}.${ciphertext}`, key),
      ).toThrow();
    }
  });

  it('throws on a malformed payload', () => {
    expect(() => decryptFromBase64('not-a-valid-payload', key)).toThrow();
  });

  it('throws when decrypted with the wrong key', () => {
    const encrypted = encryptToBase64('super-secret-token', key);
    expect(() => decryptFromBase64(encrypted, randomBytes(32))).toThrow();
  });
});
