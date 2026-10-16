import { describe, expect, it } from 'vitest';
import { scrubError, scrubSentryEvent, scrubString, scrubUrl, scrubValue } from './scrub.js';

describe('scrubString', () => {
  it('removes an email address inside a sentence', () => {
    expect(scrubString('send to someone@example.com now')).toBe('send to [REDACTED_EMAIL] now');
  });

  it('removes a UPI ID inside a sentence, with the surrounding text kept', () => {
    expect(scrubString('payout to raj.kumar@okaxis failed')).toBe(
      'payout to [REDACTED_UPI] failed',
    );
    expect(scrubString('raj@okaxis')).toBe('[REDACTED_UPI]');
  });

  it('does not take a package path in a stack for an address', () => {
    const frame = 'at x (/app/node_modules/.pnpm/router@2.2.0/node_modules/router/index.js:1:2)';
    expect(scrubString(frame)).toBe(frame);
  });

  it('does not take an email for a UPI ID or the other way round', () => {
    expect(scrubString('a@example.co.in')).toBe('[REDACTED_EMAIL]');
    expect(scrubString('see a@b and 42')).toBe('see a@b and 42');
  });

  it('removes bank-account-shaped digits but not shorter numbers or parts of a UUID', () => {
    expect(scrubString('account 123456789012 debited')).toBe('account [REDACTED_NUMBER] debited');
    expect(scrubString('amount 88500 paise')).toBe('amount 88500 paise');
    const uuid = '0197c0a0-0000-7000-8000-000000000000';
    expect(scrubString(`deal ${uuid}`)).toBe(`deal ${uuid}`);
  });

  it('removes PAN and IFSC shapes', () => {
    expect(scrubString('PAN ABCDE1234F, IFSC HDFC0001234')).toBe(
      'PAN [REDACTED_PAN], IFSC [REDACTED_IFSC]',
    );
  });

  it('removes secrets in a query string, a JSON body and a bearer header', () => {
    expect(scrubString('/cb?code=abc123&state=xyz&ok=1')).toBe(
      '/cb?code=[REDACTED]&state=[REDACTED]&ok=1',
    );
    expect(scrubString('{"token":"abc","name":"Raj"}')).toBe('{"token":"[REDACTED]","name":"Raj"}');
    expect(scrubString('Authorization: Bearer abc.def-ghi')).toBe(
      'Authorization: Bearer [REDACTED]',
    );
  });

  it('leaves ordinary text alone', () => {
    expect(scrubString('This deal just changed. Reload it and try again.')).toBe(
      'This deal just changed. Reload it and try again.',
    );
  });
});

describe('scrubUrl', () => {
  it('drops the query and the fragment', () => {
    expect(scrubUrl('/api/auth/instagram/callback?code=abc&state=xyz#frag')).toBe(
      '/api/auth/instagram/callback',
    );
    expect(scrubUrl('https://api.valueskins.com/api/deals/1')).toBe(
      'https://api.valueskins.com/api/deals/1',
    );
  });
});

describe('scrubValue', () => {
  it('redacts sensitive keys at any depth and scrubs every string', () => {
    const result = scrubValue({
      vpa: 'raj@okaxis',
      nested: { token: 'abc', note: 'mail me at a.b@example.com', list: ['x', { code: '1' }] },
      count: 3,
    });
    expect(result).toEqual({
      vpa: '[REDACTED]',
      nested: {
        token: '[REDACTED]',
        note: 'mail me at [REDACTED_EMAIL]',
        list: ['x', { code: '[REDACTED]' }],
      },
      count: 3,
    });
  });

  it('keeps an error as name, message and stack, scrubbed', () => {
    const error = new Error('could not pay raj@okaxis (other@example.com)');
    const result = scrubValue({ err: error }) as {
      err: { type: string; message: string; stack: string };
    };
    expect(result.err.type).toBe('Error');
    expect(result.err.message).toBe('could not pay [REDACTED_UPI] ([REDACTED_EMAIL])');
    expect(result.err.stack).not.toContain('raj@okaxis');
    expect(result.err.stack).toContain('could not pay');
  });

  it('scrubs the cause of an error and survives a cycle', () => {
    const inner = new Error('inner raj@okaxis');
    const outer = new Error('outer', { cause: inner });
    (inner as { cause?: unknown }).cause = outer;
    const result = scrubError(outer) as { cause: { message: string } };
    expect(result.cause.message).toBe('inner [REDACTED_UPI]');
    const obj: Record<string, unknown> = { name: 'c' };
    obj.self = obj;
    expect((scrubValue(obj) as Record<string, unknown>).self).toBe('[Circular]');
  });
});

describe('scrubSentryEvent', () => {
  const event = {
    event_id: 'abc',
    level: 'error',
    message: 'failed for someone@example.com',
    server_name: 'srv-1',
    user: { id: '1', email: 'someone@example.com', ip_address: '1.2.3.4' },
    request: {
      method: 'POST',
      url: 'https://api.valueskins.com/api/deals?code=abc',
      headers: { cookie: 'vs_session=abc', authorization: 'Bearer x' },
      cookies: { vs_session: 'abc' },
      data: { vpa: 'raj@okaxis', email: 'someone@example.com' },
      query_string: 'code=abc',
      env: { REMOTE_ADDR: '1.2.3.4' },
    },
    breadcrumbs: [{ message: 'GET /x', data: { email: 'a@example.com' } }],
    exception: {
      values: [
        {
          type: 'Error',
          value: 'payout to raj@okaxis failed',
          stacktrace: { frames: [{ filename: 'a.js', lineno: 3, vars: { vpa: 'raj@okaxis' } }] },
        },
      ],
    },
    tags: { route: '/api/deals' },
  };

  it('removes the user, ip, server name, request material and breadcrumbs', () => {
    const out = scrubSentryEvent(event) as Record<string, unknown>;
    expect(out.user).toBeUndefined();
    expect(out.server_name).toBeUndefined();
    expect(out.breadcrumbs).toBeUndefined();
    expect(out.request).toEqual({ method: 'POST', url: 'https://api.valueskins.com/api/deals' });
  });

  it('scrubs the message and the exception, and drops stack variables', () => {
    const out = scrubSentryEvent(event) as {
      message: string;
      exception: {
        values: Array<{ value: string; stacktrace: { frames: Array<Record<string, unknown>> } }>;
      };
    };
    expect(out.message).toBe('failed for [REDACTED_EMAIL]');
    expect(out.exception.values[0]?.value).toBe('payout to [REDACTED_UPI] failed');
    expect(out.exception.values[0]?.stacktrace.frames[0]).toEqual({ filename: 'a.js', lineno: 3 });
  });

  it('leaves nothing sensitive anywhere in the serialized event, and does not change its input', () => {
    const before = JSON.stringify(event);
    const text = JSON.stringify(scrubSentryEvent(event));
    for (const secret of [
      'someone@example.com',
      'raj@okaxis',
      '1.2.3.4',
      'vs_session',
      'Bearer x',
    ]) {
      expect(text, secret).not.toContain(secret);
    }
    expect(JSON.stringify(event)).toBe(before);
  });
});
