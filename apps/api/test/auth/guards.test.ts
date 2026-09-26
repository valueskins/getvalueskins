import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { requireAdmin, requireOnboarded, requireRole, requireUser } from '../../src/auth/guards.js';
import type { AuthenticatedUser } from '../../src/auth/types.js';
import { errorMiddleware } from '../../src/errors/errorMiddleware.js';

function fixtureUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    instagramUserId: 'ig-1',
    username: 'fixture',
    role: 'CREATOR',
    isAdmin: false,
    onboardingCompletedAt: new Date(),
    email: 'fixture@example.com',
    emailVerifiedAt: new Date(),
    ...overrides,
  };
}

function injectUser(user?: AuthenticatedUser) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (user) req.user = user;
    next();
  };
}

function buildApp(user: AuthenticatedUser | undefined) {
  const app = express();
  app.get('/require-user', injectUser(user), requireUser, (_req, res) => res.json({ ok: true }));
  app.get('/require-role', injectUser(user), requireRole('BRAND'), (_req, res) =>
    res.json({ ok: true }),
  );
  app.get('/require-onboarded', injectUser(user), requireOnboarded, (_req, res) =>
    res.json({ ok: true }),
  );
  app.get('/require-admin', injectUser(user), requireAdmin, (_req, res) => res.json({ ok: true }));
  app.use(errorMiddleware);
  return app;
}

describe('requireUser', () => {
  it('401s with no user', async () => {
    const response = await request(buildApp(undefined)).get('/require-user');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('passes with a user', async () => {
    const response = await request(buildApp(fixtureUser())).get('/require-user');
    expect(response.status).toBe(200);
  });
});

describe('requireRole', () => {
  it('401s with no user', async () => {
    const response = await request(buildApp(undefined)).get('/require-role');
    expect(response.status).toBe(401);
  });

  it('403s ROLE_NOT_CHOSEN when role is null', async () => {
    const response = await request(buildApp(fixtureUser({ role: null }))).get('/require-role');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROLE_NOT_CHOSEN');
  });

  it('403s WRONG_ROLE on a mismatched role', async () => {
    const response = await request(buildApp(fixtureUser({ role: 'CREATOR' }))).get('/require-role');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('WRONG_ROLE');
  });

  it('passes when the role matches', async () => {
    const response = await request(buildApp(fixtureUser({ role: 'BRAND' }))).get('/require-role');
    expect(response.status).toBe(200);
  });
});

describe('requireOnboarded', () => {
  it('401s with no user', async () => {
    const response = await request(buildApp(undefined)).get('/require-onboarded');
    expect(response.status).toBe(401);
  });

  it('403s ONBOARDING_INCOMPLETE when not onboarded', async () => {
    const response = await request(buildApp(fixtureUser({ onboardingCompletedAt: null }))).get(
      '/require-onboarded',
    );
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ONBOARDING_INCOMPLETE');
  });

  it('passes when onboarded', async () => {
    const response = await request(buildApp(fixtureUser())).get('/require-onboarded');
    expect(response.status).toBe(200);
  });
});

describe('requireAdmin', () => {
  it('404s with no user', async () => {
    const response = await request(buildApp(undefined)).get('/require-admin');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('404s for a non-admin user (not 401/403 — indistinguishable from a missing route)', async () => {
    const response = await request(buildApp(fixtureUser({ isAdmin: false }))).get('/require-admin');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('passes for an admin user', async () => {
    const response = await request(buildApp(fixtureUser({ isAdmin: true }))).get('/require-admin');
    expect(response.status).toBe(200);
  });
});
