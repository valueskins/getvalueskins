import { createHash } from 'node:crypto';
import { decryptFromBase64, encryptToBase64 } from '../crypto/aesGcm.js';
import type { Env } from '../env/index.js';

/**
 * AES-256-GCM needs an exact 32-byte key, but TOKEN_ENCRYPTION_KEY is an
 * arbitrary env string with no guaranteed length or encoding — hash it to a
 * fixed 32 bytes so any value works.
 */
function deriveKey(env: Env): Buffer {
  return createHash('sha256').update(env.TOKEN_ENCRYPTION_KEY).digest();
}

export function encryptInstagramToken(token: string, env: Env): string {
  return encryptToBase64(token, deriveKey(env));
}

/** Throws if the stored value has been tampered with or corrupted. */
export function decryptInstagramToken(encrypted: string, env: Env): string {
  return decryptFromBase64(encrypted, deriveKey(env));
}
