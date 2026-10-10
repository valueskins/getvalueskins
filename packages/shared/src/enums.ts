export { DEAL_STATUSES, type DealStatus } from './dealStateMachine.js';

export const USER_ROLES = ['CREATOR', 'BRAND'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PAYOUT_ACCOUNT_STATUSES = [
  'PENDING',
  'ACTIVE',
  'NEEDS_CLARIFICATION',
  'SUSPENDED',
] as const;
export type PayoutAccountStatus = (typeof PAYOUT_ACCOUNT_STATUSES)[number];

export const CANCELLED_BY_ROLES = ['BRAND', 'ADMIN'] as const;
export type CancelledByRole = (typeof CANCELLED_BY_ROLES)[number];

export const APPLICATION_STATUSES = ['APPLIED', 'CONFIRMED', 'REJECTED'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const PAYMENT_TYPES = ['COMMISSION', 'ADVANCE', 'FINAL'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_STATUSES = ['CREATED', 'CAPTURED', 'FAILED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const TRANSFER_TYPES = ['ADVANCE', 'FINAL'] as const;
export type TransferType = (typeof TRANSFER_TYPES)[number];

export const TRANSFER_STATUSES = ['PENDING', 'PROCESSED', 'FAILED', 'REVERSED'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const INVOICE_KINDS = [
  'COMMISSION_TAX_INVOICE',
  'ADVANCE_RECEIPT',
  'FINAL_RECEIPT',
] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const DEAL_EVENT_ACTOR_TYPES = ['USER', 'SYSTEM', 'ADMIN'] as const;
export type DealEventActorType = (typeof DEAL_EVENT_ACTOR_TYPES)[number];

export const EMAIL_LOG_STATUSES = ['QUEUED', 'SENT', 'FAILED'] as const;
export type EmailLogStatus = (typeof EMAIL_LOG_STATUSES)[number];

export const DISPUTE_STATUSES = ['OPEN', 'RESOLVED'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

// SPEC 8 templates, plus "Your sign-in code" (V0_LAUNCH 2.1 email-code login).
export const EMAIL_TEMPLATES = [
  'VERIFY_EMAIL',
  'DEAL_PUBLISHED',
  'NEW_APPLICATION',
  'YOU_WERE_SELECTED',
  'APPLICATION_NOT_SELECTED',
  'COMMISSION_PAID_BRAND',
  'COMMISSION_PAID_CREATOR',
  'ADVANCE_PAID',
  'CONTENT_UPLOADED',
  'CHANGES_REQUESTED',
  'CONTENT_APPROVED',
  'FINAL_PAYMENT_DONE',
  'DEAL_REPORT_READY',
  'DEAL_CANCELLED',
  'COMMISSION_PAYMENT_REMINDER',
  'CONTENT_OVERDUE',
  'REVIEW_REMINDER',
  'DISPUTE_RAISED',
  'DISPUTE_RESOLVED',
  'PAYOUT_ACCOUNT_STATUS',
  'ADMIN_ALERT',
  'SIGN_IN_CODE',
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];
