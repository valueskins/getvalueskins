// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn();
const captureException = vi.fn();
const captureRequestError = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  init: (options: unknown) => init(options),
  captureException: (error: unknown) => captureException(error),
  captureRequestError: (...args: unknown[]) => captureRequestError(...args),
  linkedErrorsIntegration: () => ({ name: 'LinkedErrors' }),
  dedupeIntegration: () => ({ name: 'Dedupe' }),
  globalHandlersIntegration: () => ({ name: 'GlobalHandlers' }),
}));

import { sentryDsn, sentryIngestOrigin } from '@/lib/sentryDsn';
import { initSentry, reportError } from '@/lib/sentryInit';

const DSN = 'https://publickey@o9.ingest.sentry.io/1';

beforeEach(() => {
  init.mockClear();
  captureException.mockClear();
  captureRequestError.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe('Sentry is off unless NEXT_PUBLIC_SENTRY_DSN is set', () => {
  it('does not start, and reports nothing, without a DSN', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    expect(sentryDsn()).toBeUndefined();
    initSentry('client');
    initSentry('server');
    reportError(new Error('boom'));
    expect(init).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('treats a blank DSN as unset', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '   ');
    expect(sentryDsn()).toBeUndefined();
  });

  it('the server request-error hook does nothing while it is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    const { onRequestError } = await import('@/instrumentation');
    (onRequestError as (...args: unknown[]) => void)(new Error('x'), {}, {});
    expect(captureRequestError).not.toHaveBeenCalled();
  });
});

describe('Sentry with a DSN', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN));

  it('starts for errors only: no tracing, no breadcrumbs, no default integrations', () => {
    initSentry('client');
    const options = init.mock.calls[0]![0] as Record<string, unknown>;
    expect(options.dsn).toBe(DSN);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.maxBreadcrumbs).toBe(0);
    expect(options.defaultIntegrations).toBe(false);
    expect(options).not.toHaveProperty('replaysSessionSampleRate');
    expect(options).not.toHaveProperty('replaysOnErrorSampleRate');
    expect((options.beforeBreadcrumb as () => unknown)()).toBeNull();
  });

  it('listens for window errors in the browser only', () => {
    initSentry('client');
    initSentry('server');
    const names = (call: number) =>
      (init.mock.calls[call]![0] as { integrations: Array<{ name: string }> }).integrations.map(
        (i) => i.name,
      );
    expect(names(0)).toContain('GlobalHandlers');
    expect(names(1)).not.toContain('GlobalHandlers');
  });

  it('scrubs every event before it is sent', () => {
    initSentry('server');
    const { beforeSend } = init.mock.calls[0]![0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown>;
    };
    const out = beforeSend({
      message: 'failed for someone@example.com',
      user: { ip_address: '1.2.3.4' },
      request: {
        url: 'https://valueskins.com/deals?code=abc',
        headers: { cookie: 'vs_session=abc' },
        data: { vpa: 'raj@okaxis' },
      },
      breadcrumbs: [{ message: 'click' }],
    });
    const text = JSON.stringify(out);
    for (const leaked of [
      'someone@example.com',
      '1.2.3.4',
      'vs_session',
      'raj@okaxis',
      'code=abc',
    ]) {
      expect(text, leaked).not.toContain(leaked);
    }
    expect(out.request).toEqual({ url: 'https://valueskins.com/deals' });
  });

  it('reportError sends the error', () => {
    const error = new Error('boom');
    reportError(error);
    expect(captureException).toHaveBeenCalledWith(error);
  });
});

describe('the DSN host for the CSP', () => {
  it('is the https origin of the DSN host, and nothing for anything else', () => {
    expect(sentryIngestOrigin(DSN)).toBe('https://o9.ingest.sentry.io');
    expect(sentryIngestOrigin('http://k@o9.ingest.sentry.io/1')).toBeNull();
    expect(sentryIngestOrigin('nonsense')).toBeNull();
    expect(sentryIngestOrigin(undefined)).toBeNull();
  });
});
