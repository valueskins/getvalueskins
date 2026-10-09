import { randomInt } from 'node:crypto';

// No 0/O or 1/I/L: a short id is read out loud and typed from receipts.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SHORT_ID_LENGTH = 8;

/** 8 random characters for deals.short_id (SPEC 15). Uniqueness is the caller's retry on a unique violation. */
export function generateShortId(): string {
  let id = '';
  for (let i = 0; i < SHORT_ID_LENGTH; i++) {
    id += ALPHABET[randomInt(ALPHABET.length)];
  }
  return id;
}
