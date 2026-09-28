import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_LENGTH = 12;
const ALGORITHM = 'aes-256-gcm';

/** Encrypts with a fresh random IV each call. Encoded as `${iv}.${authTag}.${ciphertext}`,
 * each part base64url. `key` must be exactly 32 bytes (aes-256-gcm). */
export function encryptToBase64(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((buf) => buf.toString('base64url')).join('.');
}

/** Throws if the payload is malformed or the auth tag doesn't verify (tampered/corrupted). */
export function decryptFromBase64(encoded: string, key: Buffer): string {
  const parts = encoded.split('.');
  if (parts.length !== 3) {
    throw new Error('decryptFromBase64: malformed payload');
  }
  const [ivB64, authTagB64, ciphertextB64] = parts as [string, string, string];

  const iv = Buffer.from(ivB64, 'base64url');
  const authTag = Buffer.from(authTagB64, 'base64url');
  const ciphertext = Buffer.from(ciphertextB64, 'base64url');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
