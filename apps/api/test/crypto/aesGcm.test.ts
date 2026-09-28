import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptFromBase64, encryptToBase64 } from '../../src/crypto/aesGcm.js';

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
    const tampered = `${iv}.${authTag?.slice(0, -2)}AA.${ciphertext}`;
    expect(() => decryptFromBase64(tampered, key)).toThrow();
  });

  it('throws when the ciphertext is tampered with', () => {
    const encrypted = encryptToBase64('super-secret-token', key);
    const [iv, authTag, ciphertext] = encrypted.split('.');
    const tampered = `${iv}.${authTag}.${ciphertext?.slice(0, -2)}AA`;
    expect(() => decryptFromBase64(tampered, key)).toThrow();
  });

  it('throws on a malformed payload', () => {
    expect(() => decryptFromBase64('not-a-valid-payload', key)).toThrow();
  });

  it('throws when decrypted with the wrong key', () => {
    const encrypted = encryptToBase64('super-secret-token', key);
    expect(() => decryptFromBase64(encrypted, randomBytes(32))).toThrow();
  });
});
