import { describe, expect, it } from 'vitest';
import { deepRedact } from '../../src/logging/logger.js';

describe('deepRedact', () => {
  it('redacts a key named exactly secret/token/pan/account/code', () => {
    const result = deepRedact({
      secret: 'shh',
      token: 'abc',
      pan: 'ABCDE1234F',
      account: '1234567890',
      code: '000000',
    }) as Record<string, unknown>;

    expect(result).toEqual({
      secret: '[REDACTED]',
      token: '[REDACTED]',
      pan: '[REDACTED]',
      account: '[REDACTED]',
      code: '[REDACTED]',
    });
  });

  it('matches key names case-insensitively and as substrings (e.g. sessionSecret, authToken)', () => {
    const result = deepRedact({
      sessionSecret: 'x',
      AUTH_TOKEN: 'y',
      bankAccountNumber: 'z',
    }) as Record<string, unknown>;

    expect(result.sessionSecret).toBe('[REDACTED]');
    expect(result.AUTH_TOKEN).toBe('[REDACTED]');
    expect(result.bankAccountNumber).toBe('[REDACTED]');
  });

  it('redacts an email-shaped string value even under an unrelated key name', () => {
    const result = deepRedact({ contact: 'someone@example.com', name: 'Someone' }) as Record<
      string,
      unknown
    >;

    expect(result.contact).toBe('[REDACTED_EMAIL]');
    expect(result.name).toBe('Someone');
  });

  it('redacts at any depth, inside nested objects and arrays', () => {
    const result = deepRedact({
      req: { body: { user: { email: 'nested@example.com', apiToken: 'deep-secret' } } },
      items: [{ code: '123' }, { safe: 'value' }],
    }) as Record<string, unknown>;

    const req = result.req as { body: { user: { email: unknown; apiToken: unknown } } };
    expect(req.body.user.email).toBe('[REDACTED_EMAIL]');
    expect(req.body.user.apiToken).toBe('[REDACTED]');
    const items = result.items as Array<Record<string, unknown>>;
    expect(items[0]?.code).toBe('[REDACTED]');
    expect(items[1]?.safe).toBe('value');
  });

  it('leaves unrelated values untouched', () => {
    const result = deepRedact({ status: 'ok', count: 3, active: true }) as Record<string, unknown>;
    expect(result).toEqual({ status: 'ok', count: 3, active: true });
  });

  it('does not infinite-loop on a circular reference', () => {
    const obj: Record<string, unknown> = { name: 'circular' };
    obj.self = obj;

    const result = deepRedact(obj) as Record<string, unknown>;
    expect(result.name).toBe('circular');
    expect(result.self).toBe('[Circular]');
  });
});

describe('deepRedact: UPI IDs', () => {
  it('redacts keys that name a UPI ID or payout details', () => {
    const result = deepRedact({
      vpa: 'raj@okaxis',
      payoutVpa: 'raj@okaxis',
      payout_name: 'Raj Kumar',
      upiId: 'raj@okaxis',
    }) as Record<string, unknown>;
    expect(Object.values(result)).toEqual(['[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]']);
  });

  it('redacts a UPI-shaped value under any key and at any depth, which is not email-shaped', () => {
    const result = deepRedact({
      note: 'raj.kumar@okhdfcbank',
      nested: { list: ['plain', 'cr@ybl'] },
    }) as { note: string; nested: { list: string[] } };
    expect(result.note).toBe('[REDACTED_UPI]');
    expect(result.nested.list).toEqual(['plain', '[REDACTED_UPI]']);
    expect(deepRedact('raj@okaxis')).toBe('[REDACTED_UPI]');
  });

  it('still redacts emails as emails and leaves ordinary text alone', () => {
    expect(deepRedact({ a: 'someone@example.com', b: 'hello world', c: 'a@b' })).toEqual({
      a: '[REDACTED_EMAIL]',
      b: 'hello world',
      c: 'a@b',
    });
  });
});

describe('deepRedact: text inside a string and errors', () => {
  it('removes an email or a UPI ID inside a sentence', () => {
    expect(deepRedact({ msg: 'payout to raj@okaxis failed for a@example.com' })).toEqual({
      msg: 'payout to [REDACTED_UPI] failed for [REDACTED_EMAIL]',
    });
  });

  it('keeps an Error as name, message and stack, scrubbed', () => {
    const out = deepRedact({ err: new Error('failed for raj@okaxis') }) as {
      err: { type: string; message: string; stack: string };
    };
    expect(out.err.type).toBe('Error');
    expect(out.err.message).toBe('failed for [REDACTED_UPI]');
    expect(out.err.stack).toContain('failed for [REDACTED_UPI]');
    expect(out.err.stack).not.toContain('raj@okaxis');
  });
});
