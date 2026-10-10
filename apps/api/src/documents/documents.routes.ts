import { documentKindSchema, historyQuerySchema } from '@valueskins/shared';
import { Router } from 'express';
import { requireUser } from '../auth/guards.js';
import type { ApiContext } from '../context.js';
import { loadParticipantDeal } from '../deals/access.js';
import { renderDealDocument } from './documents.service.js';
import { listDealEmails, listDealEvents } from './history.service.js';

/**
 * SPEC 16: the deal's PDFs and its email and event history. Only the deal's brand, its
 * confirmed creator and admins; everyone else gets a 404.
 */
export function documentRoutes(ctx: ApiContext): Router {
  const router = Router();

  router.get('/api/deals/:id/documents/:kind', requireUser, async (req, res, next) => {
    try {
      const deal = await loadParticipantDeal(req.params.id, req.user!);
      const kind = documentKindSchema.parse(req.params.kind);
      const document = await renderDealDocument(deal.id, kind, ctx.now());
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${document.filename}"`,
        'Cache-Control': 'private, no-store',
      });
      res.send(document.content);
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/deals/:id/emails', requireUser, async (req, res, next) => {
    try {
      const deal = await loadParticipantDeal(req.params.id, req.user!);
      res.json(await listDealEmails(deal, req.user!, historyQuerySchema.parse(req.query)));
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/deals/:id/events', requireUser, async (req, res, next) => {
    try {
      const deal = await loadParticipantDeal(req.params.id, req.user!);
      res.json(await listDealEvents(deal, historyQuerySchema.parse(req.query)));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
