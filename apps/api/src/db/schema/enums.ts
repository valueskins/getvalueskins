import { pgEnum } from 'drizzle-orm/pg-core';
import {
  USER_ROLES,
  DEAL_STATUSES,
  CANCELLED_BY_ROLES,
  APPLICATION_STATUSES,
  PAYMENT_TYPES,
  PAYMENT_STATUSES,
  DIRECT_PAYMENT_STAGES,
  INVOICE_KINDS,
  DEAL_EVENT_ACTOR_TYPES,
  EMAIL_LOG_STATUSES,
  DISPUTE_STATUSES,
} from '@valueskins/shared';

export const userRoleEnum = pgEnum('user_role', USER_ROLES);
export const dealStatusEnum = pgEnum('deal_status', DEAL_STATUSES);
export const cancelledByRoleEnum = pgEnum('cancelled_by_role', CANCELLED_BY_ROLES);
export const applicationStatusEnum = pgEnum('application_status', APPLICATION_STATUSES);
export const paymentTypeEnum = pgEnum('payment_type', PAYMENT_TYPES);
export const paymentStatusEnum = pgEnum('payment_status', PAYMENT_STATUSES);
export const directPaymentStageEnum = pgEnum('direct_payment_stage', DIRECT_PAYMENT_STAGES);
export const invoiceKindEnum = pgEnum('invoice_kind', INVOICE_KINDS);
export const dealEventActorTypeEnum = pgEnum('deal_event_actor_type', DEAL_EVENT_ACTOR_TYPES);
export const emailLogStatusEnum = pgEnum('email_log_status', EMAIL_LOG_STATUSES);
export const disputeStatusEnum = pgEnum('dispute_status', DISPUTE_STATUSES);
