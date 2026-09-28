import { describe, expect, it } from 'vitest';
import {
  decryptInstagramToken,
  encryptInstagramToken,
} from '../../src/instagram/tokenEncryption.js';
import { buildTestEnv } from '../testEnv.js';

describe('instagram token encryption', () => {
  it('round trips regardless of TOKEN_ENCRYPTION_KEY length/format', () => {
    const env = buildTestEnv({ TOKEN_ENCRYPTION_KEY: 'short-arbitrary-string' });

    const encrypted = encryptInstagramToken('IGQVJ...long-lived-token', env);
    expect(decryptInstagramToken(encrypted, env)).toBe('IGQVJ...long-lived-token');
  });

  it('fails to decrypt with a different TOKEN_ENCRYPTION_KEY', () => {
    const envA = buildTestEnv({ TOKEN_ENCRYPTION_KEY: 'key-a' });
    const envB = buildTestEnv({ TOKEN_ENCRYPTION_KEY: 'key-b' });

    const encrypted = encryptInstagramToken('a-token', envA);
    expect(() => decryptInstagramToken(encrypted, envB)).toThrow();
  });
});
