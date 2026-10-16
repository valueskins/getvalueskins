import { ADMIN_CANCEL_WINDOW, ADMIN_DEAL_ALREADY_CANCELLED, ADMIN_NO_EMAILS_YET } from './copy.js';
import { canTransition, type DealStatus } from './dealStateMachine.js';

/** What an admin can do on a deal (SPEC 12). Admins are not parties, so these replace `allowedActions`. */
export const ADMIN_DEAL_ACTIONS = ['CANCEL', 'RESEND_EMAIL'] as const;
export type AdminDealAction = (typeof ADMIN_DEAL_ACTIONS)[number];

export interface AdminDealActionState {
  action: AdminDealAction;
  enabled: boolean;
  /** Why the action is not available now, in plain words. Null when it is. */
  reason: string | null;
}

/** The admin's actions on a deal, each with a reason when it cannot be used now. */
export function computeAdminDealActions(input: {
  status: DealStatus;
  emailCount: number;
}): AdminDealActionState[] {
  const cancelReason =
    input.status === 'CANCELLED'
      ? ADMIN_DEAL_ALREADY_CANCELLED
      : canTransition(input.status, 'CANCELLED', 'ADMIN')
        ? null
        : ADMIN_CANCEL_WINDOW;
  const resendReason = input.emailCount > 0 ? null : ADMIN_NO_EMAILS_YET;
  return [
    { action: 'CANCEL', enabled: cancelReason === null, reason: cancelReason },
    { action: 'RESEND_EMAIL', enabled: resendReason === null, reason: resendReason },
  ];
}
