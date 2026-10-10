import { z } from 'zod';
import { DEAL_STATUSES } from '../dealStateMachine.js';
import { EMAIL_LOG_STATUSES, USER_ROLES } from '../enums.js';
import { cursorPageQuerySchema } from './pagination.js';

/** `:kind` in GET /deals/:id/documents/:kind (SPEC 16). */
export const DOCUMENT_KINDS = [
  'commission-invoice',
  'advance-receipt',
  'final-receipt',
  'adp',
] as const;
export const documentKindSchema = z.enum(DOCUMENT_KINDS);
export type DocumentKind = z.infer<typeof documentKindSchema>;

/** GET /deals/:id/emails and /events take the usual cursor and limit. */
export const historyQuerySchema = cursorPageQuerySchema;

/** One email of the deal's communication history (SPEC 8). Addresses are never included. */
export const dealEmailSchema = z.object({
  id: z.string(),
  template: z.string(),
  subject: z.string(),
  bodyText: z.string(),
  status: z.enum(EMAIL_LOG_STATUSES),
  attachmentNames: z.array(z.string()),
  recipient: z.object({ role: z.enum(USER_ROLES), username: z.string() }).nullable(),
  createdAt: z.string(),
});

export const dealEmailListResponseSchema = z.object({
  items: z.array(dealEmailSchema),
  nextCursor: z.string().nullable(),
});

/** One status change of the deal, from deal_events (SPEC 15). */
export const dealEventSchema = z.object({
  id: z.string(),
  fromStatus: z.enum(DEAL_STATUSES),
  toStatus: z.enum(DEAL_STATUSES),
  actor: z.object({ type: z.enum(['USER', 'SYSTEM', 'ADMIN']), username: z.string().nullable() }),
  note: z.string().nullable(),
  createdAt: z.string(),
});

export const dealEventListResponseSchema = z.object({
  items: z.array(dealEventSchema),
  nextCursor: z.string().nullable(),
});

export type DealEmail = z.infer<typeof dealEmailSchema>;
export type DealEmailListResponse = z.infer<typeof dealEmailListResponseSchema>;
export type DealEvent = z.infer<typeof dealEventSchema>;
export type DealEventListResponse = z.infer<typeof dealEventListResponseSchema>;
