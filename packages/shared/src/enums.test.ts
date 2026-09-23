import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STATUSES,
  CANCELLED_BY_ROLES,
  DEAL_EVENT_ACTOR_TYPES,
  DEAL_STATUSES,
  DISPUTE_STATUSES,
  EMAIL_LOG_STATUSES,
  INVOICE_KINDS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  PAYOUT_ACCOUNT_STATUSES,
  TRANSFER_STATUSES,
  TRANSFER_TYPES,
  USER_ROLES,
} from './enums.js';

describe('SPEC section 15 enums', () => {
  it('matches every enum exactly', () => {
    expect(DEAL_STATUSES).toEqual([
      'DRAFT',
      'OPEN',
      'CONFIRMED',
      'COMMISSION_PAID',
      'ADVANCE_PAID',
      'CONTENT_UPLOADED',
      'REVISION_REQUESTED',
      'APPROVED',
      'COMPLETED',
      'CANCELLED',
    ]);
    expect(USER_ROLES).toEqual(['CREATOR', 'BRAND']);
    expect(PAYOUT_ACCOUNT_STATUSES).toEqual([
      'PENDING',
      'ACTIVE',
      'NEEDS_CLARIFICATION',
      'SUSPENDED',
    ]);
    expect(CANCELLED_BY_ROLES).toEqual(['BRAND', 'ADMIN']);
    expect(APPLICATION_STATUSES).toEqual(['APPLIED', 'CONFIRMED', 'REJECTED']);
    expect(PAYMENT_TYPES).toEqual(['COMMISSION', 'ADVANCE', 'FINAL']);
    expect(PAYMENT_STATUSES).toEqual(['CREATED', 'CAPTURED', 'FAILED']);
    expect(TRANSFER_TYPES).toEqual(['ADVANCE', 'FINAL']);
    expect(TRANSFER_STATUSES).toEqual(['PENDING', 'PROCESSED', 'FAILED', 'REVERSED']);
    expect(INVOICE_KINDS).toEqual(['COMMISSION_TAX_INVOICE', 'ADVANCE_RECEIPT', 'FINAL_RECEIPT']);
    expect(DEAL_EVENT_ACTOR_TYPES).toEqual(['USER', 'SYSTEM', 'ADMIN']);
    expect(EMAIL_LOG_STATUSES).toEqual(['QUEUED', 'SENT', 'FAILED']);
    expect(DISPUTE_STATUSES).toEqual(['OPEN', 'RESOLVED']);
  });
});
