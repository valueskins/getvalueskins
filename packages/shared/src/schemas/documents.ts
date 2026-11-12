import { z } from 'zod';
import { DEAL_STATUSES } from '../dealStateMachine.js';
import { EMAIL_LOG_STATUSES, USER_ROLES } from '../enums.js';
import { cursorPageQuerySchema } from './pagination.js';

/** `:kind` in GET /deals/:id/documents/:kind (SPEC 16). */
export const DOCUMENT_KINDS = [
  'commission-invoice',
  'advance-payment-record',
  'final-payment-record',
  'adp',
] as const;
export const documentKindSchema = z.enum(DOCUMENT_KINDS);

/** The URL slug of each invoice kind (the deal record, `adp`, is not an invoice). */
export const DOCUMENT_SLUG_BY_INVOICE_KIND = {
  COMMISSION_TAX_INVOICE: 'commission-invoice',
  ADVANCE_PAYMENT_RECORD: 'advance-payment-record',
  FINAL_PAYMENT_RECORD: 'final-payment-record',
} as const satisfies Record<string, (typeof DOCUMENT_KINDS)[number]>;
export type DocumentKind = z.infer<typeof documentKindSchema>;

/** GET /deals/:id/emails and /events take the usual cursor and limit. */
export const historyQuerySchema = cursorPageQuerySchema;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

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

/** What a deal event is: a status change, or a payment record that left the status as it was. */
export const DEAL_EVENT_KINDS = [
  'TRANSITION',
  'PAYMENT_RECORDED',
  'PAYMENT_NOT_RECEIVED',
  /** The fee was captured after the deal had changed: kept, not applied, refunded by hand (SPEC 7.3). */
  'FEE_CAPTURED_DEAL_CHANGED',
  /** A second payment was captured on an order that was already paid: kept apart, refunded by hand (SPEC 7.3). */
  'EXTRA_PAYMENT_ON_PAID_ORDER',
  /** Razorpay captured a different amount or currency than the order: not accepted, the admin told (SPEC 7.3). */
  'FEE_AMOUNT_MISMATCH',
] as const;
export type DealEventKind = (typeof DEAL_EVENT_KINDS)[number];

/** Who did it: a brand or a creator on the deal, an admin, or the system (a webhook). */
export const EVENT_ACTOR_ROLES = ['BRAND', 'CREATOR', 'ADMIN', 'SYSTEM'] as const;

/** One event of the deal, from deal_events (SPEC 15). Shared by the deal history and the admin detail. */
export const dealEventSchema = z.object({
  id: z.string(),
  kind: z.enum(DEAL_EVENT_KINDS),
  /** For a payment record both are the status the deal was in. */
  fromStatus: z.enum(DEAL_STATUSES),
  toStatus: z.enum(DEAL_STATUSES),
  actor: z.object({
    type: z.enum(['USER', 'SYSTEM', 'ADMIN']),
    /** Null only for a user whose account is gone entirely. */
    role: z.enum(EVENT_ACTOR_ROLES).nullable(),
    /** "Deleted user" for a deleted account, never the anonymized username. */
    username: z.string().nullable(),
  }),
  note: z.string().nullable(),
  /** An admin cancel's manual refund reference, when the admin gave one. */
  refundReference: z.string().nullable(),
  createdAt: z.string(),
});

export const dealEventListResponseSchema = z.object({
  items: z.array(dealEventSchema),
  nextCursor: z.string().nullable(),
});

/** One document of a deal (GET /deals/:id), by the slug that `GET /deals/:id/documents/:kind` takes. */
export const dealDocumentSchema = z.object({
  kind: documentKindSchema,
  /** The invoice or record number; null for the deal record, which has none. */
  number: z.string().nullable(),
  issuedAt: z.string(),
});

export type DealDocument = z.infer<typeof dealDocumentSchema>;
export type DealEmail = z.infer<typeof dealEmailSchema>;
export type DealEmailListResponse = z.infer<typeof dealEmailListResponseSchema>;
export type DealEvent = z.infer<typeof dealEventSchema>;
export type DealEventListResponse = z.infer<typeof dealEventListResponseSchema>;
