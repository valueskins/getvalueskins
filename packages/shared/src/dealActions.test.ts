import { describe, expect, it } from 'vitest';
import {
  ADD_BILLING_TO_PUBLISH,
  ALREADY_APPLIED_MESSAGE,
  APPLICATIONS_CLOSED,
  CANCELLATION_NOT_POSSIBLE_AFTER_ADVANCE,
  CREATOR_PAYOUT_NOT_READY,
  UPLOAD_LIMIT_REACHED,
  NO_APPLICATIONS_YET,
  SET_UP_PAYOUTS_TO_APPLY,
} from './copy.js';
import { computeDealActions, type DealActionsInput } from './dealActions.js';
import { DEAL_STATUSES, type DealStatus } from './dealStateMachine.js';

function input(overrides: Partial<DealActionsInput>): DealActionsInput {
  return {
    status: 'OPEN',
    viewer: 'BRAND_OWNER',
    applicationsOpen: true,
    applicationCount: 1,
    hasApplied: false,
    payoutActive: true,
    creatorPayoutActive: true,
    uploadCount: 1,
    hasBilling: true,
    publishIssues: [],
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
    ]);
  });

  it('COMMISSION_PAID: pay the advance once the creator can be paid, or cancel', () => {
    expect(summary({ status: 'COMMISSION_PAID' })).toEqual([
      ['PAY_ADVANCE', true, null],
      ['CANCEL', true, null],
    ]);
    expect(summary({ status: 'COMMISSION_PAID', creatorPayoutActive: false })).toEqual([
      ['PAY_ADVANCE', false, CREATOR_PAYOUT_NOT_READY],
      ['CANCEL', true, null],
    ]);
  });

  it('APPROVED: pay the final amount; cancel is disabled with the SPEC reason', () => {
    expect(summary({ status: 'APPROVED' })).toEqual([
      ['PAY_FINAL', true, null],
      ['CANCEL', false, CANCELLATION_NOT_POSSIBLE_AFTER_ADVANCE],
    ]);
  });

  it('CONTENT_UPLOADED: suggest changes or approve; cancel stays disabled', () => {
    expect(summary({ status: 'CONTENT_UPLOADED' })).toEqual([
      ['SEND_FEEDBACK', true, null],
      ['APPROVE', true, null],
      ['CANCEL', false, CANCELLATION_NOT_POSSIBLE_AFTER_ADVANCE],
    ]);
  });

  it.each(['ADVANCE_PAID', 'REVISION_REQUESTED'] as DealStatus[])(
    '%s: cancel is disabled with the SPEC reason',
    (status) => {
      expect(summary({ status })).toEqual([
        ['CANCEL', false, CANCELLATION_NOT_POSSIBLE_AFTER_ADVANCE],
      ]);
    },
  );

  it.each(['COMPLETED', 'CANCELLED'] as DealStatus[])('%s: nothing to do', (status) => {
    expect(summary({ status })).toEqual([]);
  });
});

describe('computeDealActions: creator', () => {
  it('OPEN: can apply when open and payouts are active', () => {
    expect(summary({ viewer: 'CREATOR' })).toEqual([['APPLY', true, null]]);
  });

  it('OPEN: disabled reasons, in priority order', () => {
    expect(
      summary({
        viewer: 'CREATOR',
        hasApplied: true,
        applicationsOpen: false,
        payoutActive: false,
      }),
    ).toEqual([['APPLY', false, ALREADY_APPLIED_MESSAGE]]);
    expect(summary({ viewer: 'CREATOR', applicationsOpen: false, payoutActive: false })).toEqual([
      ['APPLY', false, APPLICATIONS_CLOSED],
    ]);
    expect(summary({ viewer: 'CREATOR', payoutActive: false })).toEqual([
      ['APPLY', false, SET_UP_PAYOUTS_TO_APPLY],
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
      ]);
    },
  );

  it('upload is disabled with the reason once 20 links are used', () => {
    expect(
      summary({ viewer: 'CONFIRMED_CREATOR', status: 'ADVANCE_PAID', uploadCount: 19 }),
    ).toEqual([['UPLOAD_CONTENT', true, null]]);
    expect(
      summary({ viewer: 'CONFIRMED_CREATOR', status: 'REVISION_REQUESTED', uploadCount: 20 }),
    ).toEqual([['UPLOAD_CONTENT', false, UPLOAD_LIMIT_REACHED]]);
  });

  it.each(DEAL_STATUSES.filter((s) => s !== 'ADVANCE_PAID' && s !== 'REVISION_REQUESTED'))(
    '%s: nothing to do',
    (status) => {
      expect(summary({ viewer: 'CONFIRMED_CREATOR', status })).toEqual([]);
    },
  );

  it('other creators never get upload actions', () => {
    for (const status of DEAL_STATUSES.filter((s) => s !== 'OPEN')) {
      expect(summary({ viewer: 'CREATOR', status })).toEqual([]);
    }
  });
});
