import { describe, expect, it } from 'vitest';
import {
  ADD_BILLING_TO_PUBLISH,
  ALREADY_APPLIED_MESSAGE,
  APPLICATIONS_CLOSED,
  CANCELLATION_NOT_POSSIBLE_AFTER_FEE,
  CREATOR_HAS_NO_UPI,
  CREATOR_NOT_AGREED_TO_SHARE_UPI,
  DISPUTE_ALREADY_OPEN,
  NO_PAYMENT_RECORDED_YET,
  WAITING_FOR_CREATOR_TO_CONFIRM,
  UPLOAD_LIMIT_REACHED,
  NO_APPLICATIONS_YET,
  ADD_UPI_TO_APPLY,
  PAYMENTS_NOT_OPEN,
  POSTING_NOT_OPEN,
} from './copy.js';
import { computeDealActions, disputeAllowed, type DealActionsInput } from './dealActions.js';
import { DEAL_STATUSES, type DealStatus } from './dealStateMachine.js';

function input(overrides: Partial<DealActionsInput>): DealActionsInput {
  return {
    status: 'OPEN',
    viewer: 'BRAND_OWNER',
    applicationsOpen: true,
    applicationCount: 1,
    hasApplied: false,
    payoutSet: true,
    uploadCount: 1,
    hasCreator: true,
    creatorPayout: 'SET',
    hasOpenDispute: false,
    pendingRecord: false,
    hasBilling: true,
    publishIssues: [],
    paymentsOpen: true,
    postingOpen: true,
    ...overrides,
  };
}

function summary(overrides: Partial<DealActionsInput>): Array<[string, boolean, string | null]> {
  return computeDealActions(input(overrides)).map((a) => [a.action, a.enabled, a.reason]);
}

describe('computeDealActions: brand owner', () => {
  it('DRAFT: edit, delete, publish', () => {
    expect(summary({ status: 'DRAFT' })).toEqual([
      ['EDIT_DRAFT', true, null],
      ['DELETE_DRAFT', true, null],
      ['PUBLISH', true, null],
    ]);
  });

  it('DRAFT: publish says why it is disabled, billing first', () => {
    expect(
      summary({ status: 'DRAFT', hasBilling: false, publishIssues: ['Add a title'] })[2],
    ).toEqual(['PUBLISH', false, ADD_BILLING_TO_PUBLISH]);
    expect(summary({ status: 'DRAFT', publishIssues: ['Add a title', 'x'] })[2]).toEqual([
      'PUBLISH',
      false,
      'Add a title',
    ]);
  });

  it('DRAFT: publish is disabled while posting is closed, before any other reason, and drafts still work', () => {
    expect(
      summary({
        status: 'DRAFT',
        postingOpen: false,
        hasBilling: false,
        publishIssues: ['Add a title'],
      }),
    ).toEqual([
      ['EDIT_DRAFT', true, null],
      ['DELETE_DRAFT', true, null],
      ['PUBLISH', false, POSTING_NOT_OPEN],
    ]);
  });

  it('CONFIRMED: the fee is disabled while payments are closed, cancel and dispute are not', () => {
    expect(summary({ status: 'CONFIRMED', paymentsOpen: false })).toEqual([
      ['PAY_COMMISSION', false, PAYMENTS_NOT_OPEN],
      ['CANCEL', true, null],
      ['RAISE_DISPUTE', true, null],
    ]);
  });

  it('the payment gate does not touch posting, and the posting gate does not touch payments', () => {
    expect(summary({ status: 'DRAFT', paymentsOpen: false })[2]).toEqual(['PUBLISH', true, null]);
    expect(summary({ status: 'CONFIRMED', postingOpen: false })[0]).toEqual([
      'PAY_COMMISSION',
      true,
      null,
    ]);
  });

  it('OPEN: confirm needs an applicant; confirm and cancel survive the application deadline', () => {
    expect(summary({ status: 'OPEN', applicationCount: 0 })).toEqual([
      ['CONFIRM_CREATOR', false, NO_APPLICATIONS_YET],
      ['CANCEL', true, null],
    ]);
    expect(summary({ status: 'OPEN', applicationsOpen: false, applicationCount: 2 })).toEqual([
      ['CONFIRM_CREATOR', true, null],
      ['CANCEL', true, null],
    ]);
  });

  it('CONFIRMED: pay the commission, or cancel', () => {
    expect(summary({ status: 'CONFIRMED' })).toEqual([
      ['PAY_COMMISSION', true, null],
      ['CANCEL', true, null],
      ['RAISE_DISPUTE', true, null],
    ]);
  });

  it('COMMISSION_PAID: pay the advance by UPI; cancel is disabled once the fee is paid', () => {
    expect(summary({ status: 'COMMISSION_PAID' })).toEqual([
      ['PAY_ADVANCE', true, null],
      ['CANCEL', false, CANCELLATION_NOT_POSSIBLE_AFTER_FEE],
      ['RAISE_DISPUTE', true, null],
    ]);
  });

  it.each([
    ['COMMISSION_PAID', 'PAY_ADVANCE'],
    ['APPROVED', 'PAY_FINAL'],
  ] as const)('%s: %s says why it is disabled', (status, action) => {
    const reasonOf = (overrides: Partial<DealActionsInput>) =>
      computeDealActions(input({ status, ...overrides })).find((a) => a.action === action);

    expect(reasonOf({ creatorPayout: 'NO_UPI' })).toEqual({
      action,
      enabled: false,
      reason: CREATOR_HAS_NO_UPI,
    });
    // A UPI ID saved without consent says so, and not "has not added a UPI ID".
    expect(reasonOf({ creatorPayout: 'NO_CONSENT' })).toEqual({
      action,
      enabled: false,
      reason: CREATOR_NOT_AGREED_TO_SHARE_UPI,
    });
    expect(reasonOf({ creatorPayout: 'SET' })?.enabled).toBe(true);
    expect(reasonOf({ creatorPayout: null })?.reason).toBe(CREATOR_HAS_NO_UPI);
    expect(reasonOf({ pendingRecord: true })).toEqual({
      action,
      enabled: false,
      reason: WAITING_FOR_CREATOR_TO_CONFIRM,
    });
    // A record waiting for the creator wins over everything else.
    expect(reasonOf({ pendingRecord: true, creatorPayout: 'NO_UPI' })?.reason).toBe(
      WAITING_FOR_CREATOR_TO_CONFIRM,
    );
  });

  it('APPROVED: pay the final by UPI; cancel is disabled with the fee-paid reason', () => {
    expect(summary({ status: 'APPROVED' })).toEqual([
      ['PAY_FINAL', true, null],
      ['CANCEL', false, CANCELLATION_NOT_POSSIBLE_AFTER_FEE],
      ['RAISE_DISPUTE', true, null],
    ]);
  });

  it('CONTENT_UPLOADED: suggest changes or approve; cancel stays disabled', () => {
    expect(summary({ status: 'CONTENT_UPLOADED' })).toEqual([
      ['SEND_FEEDBACK', true, null],
      ['APPROVE', true, null],
      ['CANCEL', false, CANCELLATION_NOT_POSSIBLE_AFTER_FEE],
      ['RAISE_DISPUTE', true, null],
    ]);
  });

  it.each(['ADVANCE_PAID', 'REVISION_REQUESTED'] as DealStatus[])(
    '%s: cancel is disabled with the fee-paid reason',
    (status) => {
      expect(summary({ status })).toEqual([
        ['CANCEL', false, CANCELLATION_NOT_POSSIBLE_AFTER_FEE],
        ['RAISE_DISPUTE', true, null],
      ]);
    },
  );

  it.each(['COMPLETED', 'CANCELLED'] as DealStatus[])(
    '%s: only a dispute can still be raised',
    (status) => {
      expect(summary({ status })).toEqual([['RAISE_DISPUTE', true, null]]);
    },
  );

  it('a cancelled deal that never had a creator has nothing to dispute', () => {
    expect(summary({ status: 'CANCELLED', hasCreator: false })).toEqual([]);
  });

  it('DRAFT and OPEN never offer a dispute', () => {
    for (const status of ['DRAFT', 'OPEN'] as DealStatus[]) {
      expect(summary({ status }).map(([a]) => a)).not.toContain('RAISE_DISPUTE');
    }
  });
});

describe('disputeAllowed', () => {
  it.each(DEAL_STATUSES)('%s', (status) => {
    const early = status === 'DRAFT' || status === 'OPEN';
    expect(disputeAllowed(status, true)).toBe(!early);
    expect(disputeAllowed(status, false)).toBe(false);
  });
});

describe('computeDealActions: creator', () => {
  it('OPEN: can apply when open and a UPI ID is saved', () => {
    expect(summary({ viewer: 'CREATOR' })).toEqual([['APPLY', true, null]]);
  });

  it('OPEN: disabled reasons, in priority order', () => {
    expect(
      summary({
        viewer: 'CREATOR',
        hasApplied: true,
        applicationsOpen: false,
        payoutSet: false,
      }),
    ).toEqual([['APPLY', false, ALREADY_APPLIED_MESSAGE]]);
    expect(summary({ viewer: 'CREATOR', applicationsOpen: false, payoutSet: false })).toEqual([
      ['APPLY', false, APPLICATIONS_CLOSED],
    ]);
    expect(summary({ viewer: 'CREATOR', payoutSet: false })).toEqual([
      ['APPLY', false, ADD_UPI_TO_APPLY],
    ]);
  });

  it.each(DEAL_STATUSES.filter((s) => s !== 'OPEN'))('%s: no actions yet', (status) => {
    expect(summary({ viewer: 'CREATOR', status })).toEqual([]);
  });
});

describe('computeDealActions: everyone else', () => {
  it.each(DEAL_STATUSES)('%s: no actions for a non-owner, non-creator viewer', (status) => {
    expect(summary({ viewer: 'NONE', status })).toEqual([]);
  });
});

describe('computeDealActions: confirmed creator', () => {
  it.each(['ADVANCE_PAID', 'REVISION_REQUESTED'] as DealStatus[])(
    '%s: can upload content',
    (status) => {
      expect(summary({ viewer: 'CONFIRMED_CREATOR', status })).toEqual([
        ['UPLOAD_CONTENT', true, null],
        ['RAISE_DISPUTE', true, null],
      ]);
    },
  );

  it('upload is disabled with the reason once 20 links are used', () => {
    expect(
      summary({ viewer: 'CONFIRMED_CREATOR', status: 'ADVANCE_PAID', uploadCount: 19 }),
    ).toEqual([
      ['UPLOAD_CONTENT', true, null],
      ['RAISE_DISPUTE', true, null],
    ]);
    expect(
      summary({ viewer: 'CONFIRMED_CREATOR', status: 'REVISION_REQUESTED', uploadCount: 20 }),
    ).toEqual([
      ['UPLOAD_CONTENT', false, UPLOAD_LIMIT_REACHED],
      ['RAISE_DISPUTE', true, null],
    ]);
  });

  it.each(DEAL_STATUSES.filter((s) => s !== 'ADVANCE_PAID' && s !== 'REVISION_REQUESTED'))(
    '%s: nothing but a dispute (and the payment confirmation)',
    (status) => {
      const early = status === 'DRAFT' || status === 'OPEN';
      const confirm: Array<[string, boolean, string | null]> =
        status === 'COMMISSION_PAID' || status === 'APPROVED'
          ? [['CONFIRM_PAYMENT_RECEIVED', false, NO_PAYMENT_RECORDED_YET]]
          : [];
      expect(summary({ viewer: 'CONFIRMED_CREATOR', status })).toEqual(
        early ? [] : [...confirm, ['RAISE_DISPUTE', true, null]],
      );
    },
  );

  it('other creators never get upload actions', () => {
    for (const status of DEAL_STATUSES.filter((s) => s !== 'OPEN')) {
      expect(summary({ viewer: 'CREATOR', status })).toEqual([]);
    }
  });
});

describe('computeDealActions: confirming a direct payment', () => {
  it.each(['COMMISSION_PAID', 'APPROVED'] as DealStatus[])(
    '%s: the confirmed creator can confirm only once a payment is recorded',
    (status) => {
      expect(
        summary({ viewer: 'CONFIRMED_CREATOR', status, pendingRecord: true }).find(
          ([a]) => a === 'CONFIRM_PAYMENT_RECEIVED',
        ),
      ).toEqual(['CONFIRM_PAYMENT_RECEIVED', true, null]);
      expect(
        summary({ viewer: 'CONFIRMED_CREATOR', status }).find(
          ([a]) => a === 'CONFIRM_PAYMENT_RECEIVED',
        ),
      ).toEqual(['CONFIRM_PAYMENT_RECEIVED', false, NO_PAYMENT_RECORDED_YET]);
    },
  );

  it.each(DEAL_STATUSES.filter((s) => s !== 'COMMISSION_PAID' && s !== 'APPROVED'))(
    '%s: no confirm action',
    (status) => {
      const actions = summary({ viewer: 'CONFIRMED_CREATOR', status, pendingRecord: true });
      expect(actions.map(([a]) => a)).not.toContain('CONFIRM_PAYMENT_RECEIVED');
    },
  );

  it('nobody else is offered it, and the brand never gets it', () => {
    for (const viewer of ['BRAND_OWNER', 'CREATOR', 'NONE'] as const) {
      for (const status of ['COMMISSION_PAID', 'APPROVED'] as DealStatus[]) {
        expect(summary({ viewer, status, pendingRecord: true }).map(([a]) => a)).not.toContain(
          'CONFIRM_PAYMENT_RECEIVED',
        );
      }
    }
  });
});

describe('RAISE_DISPUTE while a dispute is open', () => {
  it.each(['BRAND_OWNER', 'CONFIRMED_CREATOR'] as const)(
    'is disabled with a reason for the %s',
    (viewer) => {
      const states = computeDealActions(
        input({ viewer, status: 'CONTENT_UPLOADED', hasOpenDispute: true }),
      );
      expect(states.find((a) => a.action === 'RAISE_DISPUTE')).toEqual({
        action: 'RAISE_DISPUTE',
        enabled: false,
        reason: DISPUTE_ALREADY_OPEN,
      });
    },
  );

  it('is enabled again once none is open, and is not listed when disputes are not allowed', () => {
    const open = computeDealActions(input({ status: 'CONTENT_UPLOADED', hasOpenDispute: false }));
    expect(open.find((a) => a.action === 'RAISE_DISPUTE')?.enabled).toBe(true);
    const early = computeDealActions(input({ status: 'OPEN', hasOpenDispute: true }));
    expect(early.some((a) => a.action === 'RAISE_DISPUTE')).toBe(false);
  });
});
