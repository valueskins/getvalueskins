import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createSession } from '../../src/auth/session.js';
import { db } from '../../src/db/client.js';
import { metaDeletionRequests, sessions, users } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();
const app = createApp(env);

function buildSignedRequest(payload: object): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', env.META_APP_SECRET).update(encodedPayload).digest('base64url');
  return `${sig}.${encodedPayload}`;
}

beforeAll(async () => {
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await closeDb();
});

describe('Meta callbacks', () => {
  describe('POST /api/meta/deauthorize', () => {
    it('rejects an invalid signed_request', async () => {
      const response = await request(app)
        .post('/api/meta/deauthorize')
        .type('form')
        .send({ signed_request: 'not-valid' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('INVALID_SIGNED_REQUEST');
    });

    it('clears only the Instagram token fields, leaving the account and sessions intact', async () => {
      const [user] = await db
        .insert(users)
        .values({
          instagramUserId: 'ig-deauth-1',
          username: 'deauthuser',
          name: 'Deauth User',
          igAccountType: 'BUSINESS',
          igTokenEncrypted: 'encrypted-token',
          igTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
        })
        .returning();
      await createSession({ userId: user!.id });

      const signedRequest = buildSignedRequest({
        algorithm: 'HMAC-SHA256',
        issued_at: Math.floor(Date.now() / 1000),
        user_id: 'ig-deauth-1',
      });

      const response = await request(app)
        .post('/api/meta/deauthorize')
        .type('form')
        .send({ signed_request: signedRequest });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });

      const [after] = await db.select().from(users).where(eq(users.id, user!.id));
      expect(after?.igTokenEncrypted).toBeNull();
      expect(after?.igTokenExpiresAt).toBeNull();
      expect(after?.instagramUserId).toBe('ig-deauth-1');
      expect(after?.deletedAt).toBeNull();

      const remainingSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, user!.id));
      expect(remainingSessions).toHaveLength(1);
    });
  });

  describe('POST /api/meta/data-deletion', () => {
    it('rejects an invalid signed_request', async () => {
      const response = await request(app)
        .post('/api/meta/data-deletion')
        .type('form')
        .send({ signed_request: 'not-valid' });

      expect(response.status).toBe(403);
    });

    it('soft-deletes and anonymizes a known user', async () => {
      const [user] = await db
        .insert(users)
        .values({
          instagramUserId: 'ig-delete-1',
          username: 'deleteuser',
          name: 'Delete User',
          igAccountType: 'BUSINESS',
          igTokenEncrypted: 'encrypted-token',
          igTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
          email: 'deleteuser@example.com',
        })
        .returning();

      const signedRequest = buildSignedRequest({
        algorithm: 'HMAC-SHA256',
        issued_at: Math.floor(Date.now() / 1000),
        user_id: 'ig-delete-1',
      });

      const response = await request(app)
        .post('/api/meta/data-deletion')
        .type('form')
        .send({ signed_request: signedRequest });

      expect(response.status).toBe(200);
      expect(response.body.confirmation_code).toBeTruthy();
      expect(response.body.url).toContain(
        `/api/meta/deletion-status/${response.body.confirmation_code}`,
      );

      const [after] = await db.select().from(users).where(eq(users.id, user!.id));
      expect(after?.deletedAt).not.toBeNull();
      expect(after?.instagramUserId).toBeNull();
      expect(after?.email).toBeNull();

      const [requestRow] = await db
        .select()
        .from(metaDeletionRequests)
        .where(eq(metaDeletionRequests.confirmationCode, response.body.confirmation_code));
      expect(requestRow?.status).toBe('COMPLETED');
    });

    it('records NOT_FOUND for an unknown instagram_user_id', async () => {
      const signedRequest = buildSignedRequest({
        algorithm: 'HMAC-SHA256',
        issued_at: Math.floor(Date.now() / 1000),
        user_id: 'ig-does-not-exist',
      });

      const response = await request(app)
        .post('/api/meta/data-deletion')
        .type('form')
        .send({ signed_request: signedRequest });

      expect(response.status).toBe(200);
      const [requestRow] = await db
        .select()
        .from(metaDeletionRequests)
        .where(eq(metaDeletionRequests.confirmationCode, response.body.confirmation_code));
      expect(requestRow?.status).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/meta/deletion-status/:code', () => {
    it('returns the status for a known code', async () => {
      await db.insert(metaDeletionRequests).values({
        instagramUserId: 'ig-status-1',
        confirmationCode: 'abc123',
        status: 'COMPLETED',
        completedAt: new Date(),
      });

      const response = await request(app).get('/api/meta/deletion-status/abc123');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('COMPLETED');
    });

    it('returns 404 for an unknown code', async () => {
      const response = await request(app).get('/api/meta/deletion-status/does-not-exist');
      expect(response.status).toBe(404);
    });
  });
});
