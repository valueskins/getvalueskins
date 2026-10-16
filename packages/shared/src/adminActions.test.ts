import { describe, expect, it } from 'vitest';
import { computeAdminDealActions } from './adminActions.js';
import { ADMIN_CANCEL_WINDOW, ADMIN_DEAL_ALREADY_CANCELLED, ADMIN_NO_EMAILS_YET } from './copy.js';
import { DEAL_STATUSES } from './dealStateMachine.js';

const cancelOf = (status: (typeof DEAL_STATUSES)[number]) =>
  computeAdminDealActions({ status, emailCount: 1 }).find((a) => a.action === 'CANCEL')!;

describe('admin deal actions', () => {
  it('allows cancel from fee paid to approved, with a reason everywhere else', () => {
    const window = [
      'COMMISSION_PAID',
      'ADVANCE_PAID',
      'CONTENT_UPLOADED',
      'REVISION_REQUESTED',
      'APPROVED',
    ];
    for (const status of DEAL_STATUSES) {
      const cancel = cancelOf(status);
      if (window.includes(status)) {
        expect(cancel).toEqual({ action: 'CANCEL', enabled: true, reason: null });
      } else if (status === 'CANCELLED') {
        expect(cancel).toEqual({
          action: 'CANCEL',
          enabled: false,
          reason: ADMIN_DEAL_ALREADY_CANCELLED,
        });
      } else {
        expect(cancel).toEqual({ action: 'CANCEL', enabled: false, reason: ADMIN_CANCEL_WINDOW });
      }
    }
  });

  it('allows a resend once the deal has an email', () => {
    const resend = (emailCount: number) =>
      computeAdminDealActions({ status: 'OPEN', emailCount }).find(
        (a) => a.action === 'RESEND_EMAIL',
      );
    expect(resend(0)).toEqual({
      action: 'RESEND_EMAIL',
      enabled: false,
      reason: ADMIN_NO_EMAILS_YET,
    });
    expect(resend(3)).toEqual({ action: 'RESEND_EMAIL', enabled: true, reason: null });
  });
});
