import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fetchProfile, refreshLongLivedToken } from '../../src/instagram/client.js';
import { InstagramApiError } from '../../src/instagram/errors.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function failure(call: () => Promise<unknown>): Promise<InstagramApiError> {
  try {
    await call();
  } catch (error) {
    expect(error).toBeInstanceOf(InstagramApiError);
    return error as InstagramApiError;
  }
  throw new Error('expected the call to fail');
}

describe('Instagram API errors', () => {
  it('carries the Meta error code and the HTTP status', async () => {
    server.use(
      http.get('https://graph.instagram.com/me', () =>
        HttpResponse.json(
          { error: { message: 'Invalid OAuth access token', type: 'OAuthException', code: 190 } },
          { status: 400 },
        ),
      ),
    );
    const error = await failure(() => fetchProfile('t'));
    expect(error).toMatchObject({ metaCode: 190, httpStatus: 400, code: 'INSTAGRAM_AUTH_FAILED' });
    expect(error.isInvalidToken).toBe(true);
    expect(error.isRateLimited).toBe(false);
  });

  it.each([4, 17, 32, 613])('knows Meta code %s is a rate limit', async (metaCode) => {
    server.use(
      http.get('https://graph.instagram.com/refresh_access_token', () =>
        HttpResponse.json({ error: { message: 'slow down', code: metaCode } }, { status: 400 }),
      ),
    );
    const error = await failure(() => refreshLongLivedToken('t'));
    expect(error.isRateLimited).toBe(true);
    expect(error.isInvalidToken).toBe(false);
  });

  it('turns a 429 with an empty or unreadable body into an error, not a silent success', async () => {
    server.use(
      http.get(
        'https://graph.instagram.com/me',
        () => new HttpResponse('Too many', { status: 429 }),
      ),
    );
    const error = await failure(() => fetchProfile('t'));
    expect(error.httpStatus).toBe(429);
    expect(error.isRateLimited).toBe(true);
  });

  it('turns a failed call with an empty JSON body into an error', async () => {
    server.use(
      http.get('https://graph.instagram.com/me', () => HttpResponse.json({}, { status: 503 })),
    );
    const error = await failure(() => fetchProfile('t'));
    expect(error.httpStatus).toBe(503);
    expect(error.message).toContain('503');
  });
});
