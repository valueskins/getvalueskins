import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { Router } from 'express';
import { db } from '../db/client.js';
import { metaDeletionRequests, users } from '../db/schema/index.js';
import type { Env } from '../env/index.js';
import { clearInstagramToken } from './deauthorize.service.js';
import { softDeleteAndAnonymizeUser } from './deletion.service.js';
import { verifySignedRequest } from './signedRequest.js';

function invalidSignedRequest(res: Response): void {
  res
    .status(403)
    .json({ error: { code: 'INVALID_SIGNED_REQUEST', message: 'Invalid signed_request' } });
}

/**
 * SPEC 6.1: Meta app requirements. Mounted unconditionally (these callbacks
 * must exist regardless of AUTH_EMAIL_ENABLED/dev-login flags). `/api/meta/`
 * is already exempt from originCheck by path prefix (security/originCheck.ts).
 */
export function metaRoutes(env: Env): Router {
  const router = Router();

  router.post('/api/meta/deauthorize', async (req, res, next) => {
    try {
      const signedRequest = req.body?.signed_request;
      if (typeof signedRequest !== 'string') {
        invalidSignedRequest(res);
        return;
      }
      const payload = verifySignedRequest(signedRequest, env.META_APP_SECRET);
      if (!payload) {
        invalidSignedRequest(res);
        return;
      }

      await clearInstagramToken(payload.user_id);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/meta/data-deletion', async (req, res, next) => {
    try {
      const signedRequest = req.body?.signed_request;
      if (typeof signedRequest !== 'string') {
        invalidSignedRequest(res);
        return;
      }
      const payload = verifySignedRequest(signedRequest, env.META_APP_SECRET);
      if (!payload) {
        invalidSignedRequest(res);
        return;
      }

      const confirmationCode = randomBytes(16).toString('hex');
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.instagramUserId, payload.user_id))
        .limit(1);

      const status = existing[0] ? 'COMPLETED' : 'NOT_FOUND';
      if (existing[0]) {
        await softDeleteAndAnonymizeUser(existing[0].id);
      }

      await db.insert(metaDeletionRequests).values({
        instagramUserId: payload.user_id,
        confirmationCode,
        status,
        completedAt: new Date(),
      });

      res.json({
        url: `${req.protocol}://${req.get('host')}/api/meta/deletion-status/${confirmationCode}`,
        confirmation_code: confirmationCode,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/meta/deletion-status/:code', async (req, res, next) => {
    try {
      const rows = await db
        .select({ status: metaDeletionRequests.status })
        .from(metaDeletionRequests)
        .where(eq(metaDeletionRequests.confirmationCode, req.params.code))
        .limit(1);

      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
        return;
      }
      res.json({ status: row.status });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
