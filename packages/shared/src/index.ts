export const APP_NAME = 'ValueSkins';

export * from './config.js';
export * from './launch.js';
export * from './money.js';
export * from './dealStateMachine.js';
export * from './dealPublish.js';
export * from './dealActions.js';
export * from './dealTurn.js';
export * from './dealSteps.js';
export * from './adminActions.js';
export * from './copy.js';
export * from './onboarding.js';
export * from './accountType.js';
export * from './age.js';
export * from './payoutUpi.js';
export * from './upiPay.js';
export * from './realtime.js';
export * from './scrub.js';
export * from './invoices.js';
export * from './schemas/index.js';

// enums.ts re-exports DealStatus/DEAL_STATUSES from dealStateMachine.js (already
// exported above via `export *`) — re-list the rest explicitly here to avoid a
// duplicate-export ambiguity at this barrel.
export {
  USER_ROLES,
  type UserRole,
  USER_GENDERS,
  type UserGender,
  CANCELLED_BY_ROLES,
  type CancelledByRole,
  APPLICATION_STATUSES,
  type ApplicationStatus,
  PAYMENT_TYPES,
  type PaymentType,
  PAYMENT_STATUSES,
  type PaymentStatus,
  DIRECT_PAYMENT_STAGES,
  type DirectPaymentStage,
  INVOICE_KINDS,
  type InvoiceKind,
  DEAL_EVENT_ACTOR_TYPES,
  type DealEventActorType,
  EMAIL_LOG_STATUSES,
  type EmailLogStatus,
  DISPUTE_STATUSES,
  type DisputeStatus,
  EMAIL_TEMPLATES,
  type EmailTemplate,
} from './enums.js';
