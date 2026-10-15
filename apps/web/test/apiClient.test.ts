import { describe, expect, it } from 'vitest';
import { api, ApiError } from '@/lib/api/client';
import { errorText, fieldErrors } from '@/lib/api/errors';
import { apiError, json, mockApi } from './helpers/api';
import { vi } from 'vitest';

describe('api client', () => {
  it('sends the session cookie and no Content-Type on a GET', async () => {
    const { calls } = mockApi({ 'GET /me': { ok: true } });
    await api('GET', '/me');
    expect(calls[0]!.init.credentials).toBe('include');
    expect(calls[0]!.init.headers).toBeUndefined();
  });

  it('sends JSON with a body', async () => {
    const { calls } = mockApi({ 'POST /me/email': { ok: true } });
    await api('POST', '/me/email', { email: 'a@example.test' });
    expect(calls[0]!.init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(calls[0]!.body).toEqual({ email: 'a@example.test' });
  });

  it('calls the API base URL under /api', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api-staging.valueskins.com/');
    const { fetchMock } = mockApi({ 'GET /config': {} });
    await api('GET', '/config');
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://api-staging.valueskins.com/api/config',
    );
  });

  it('turns the error envelope into an ApiError with details and Retry-After', async () => {
    mockApi({
      'PUT /me/profile': apiError(400, 'VALIDATION_ERROR', 'Invalid request', [
        { path: 'city', message: 'Enter your city' },
      ]),
      'POST /me/email/resend': json(
        429,
        { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
        {
          'Retry-After': '120',
        },
      ),
    });
    const err = await api('PUT', '/me/profile', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('VALIDATION_ERROR');
    expect(fieldErrors((err as ApiError).details)).toEqual({ city: 'Enter your city' });

    const limited = (await api('POST', '/me/email/resend').catch((e: unknown) => e)) as ApiError;
    expect(limited.status).toBe(429);
    expect(limited.retryAfter).toBe(120);
  });

  it('reports an unreachable API as NETWORK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const err = (await api('GET', '/me').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('NETWORK');
    expect(errorText(err)).toBe('Could not reach ValueSkins. Check your connection and try again.');
  });

  it('shows the API message for most codes, plain text for server errors, and screen overrides', () => {
    const locked = new ApiError({
      status: 409,
      code: 'PROFILE_LOCKED',
      message: 'Your profile is saved.',
    });
    expect(errorText(locked)).toBe('Your profile is saved.');
    expect(errorText(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'boom' }))).toBe(
      'Something went wrong. Try again.',
    );
    expect(errorText(locked, { PROFILE_LOCKED: 'Saved once.' })).toBe('Saved once.');
    expect(errorText(new Error('x'))).toBe('Something went wrong. Try again.');
  });
});
