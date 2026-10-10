import { z } from 'zod';
import { DEAL_STATUSES } from '../dealStateMachine.js';
import { cursorPageQuerySchema } from './pagination.js';
import { REFUND_REFERENCE_MAX } from './dispute.js';

/** Short ids are 8 characters, so a search longer than that can never match. */
const SHORT_ID_SEARCH_MAX = 8;

/** GET /admin/deals (SPEC 12): optional status filter and short id search. */
export const adminDealListQuerySchema = cursorPageQuerySchema
  .extend({
    status: z.enum(DEAL_STATUSES).optional(),
    q: z.string().trim().min(1).max(SHORT_ID_SEARCH_MAX).optional(),
  })
  .strict();

export type AdminDealListQuery = z.infer<typeof adminDealListQuerySchema>;

/** POST /admin/deals/:id/cancel: the resolution note is required, the refund reference is optional. */
export const adminCancelSchema = z
  .object({
    note: z.string().trim().min(1).max(5000),
    refundReference: z.string().trim().min(1).max(REFUND_REFERENCE_MAX).optional(),
  })
  .strict();

export type AdminCancelInput = z.infer<typeof adminCancelSchema>;

/** POST /admin/transfers/:id/mark-manual: where the money was paid from, e.g. a bank transfer reference. */
export const markManualSchema = z
  .object({
    reference: z.string().trim().min(1).max(REFUND_REFERENCE_MAX),
  })
  .strict();

export type MarkManualInput = z.infer<typeof markManualSchema>;
