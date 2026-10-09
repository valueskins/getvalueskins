import { describe, expect, it } from 'vitest';
import {
  ADD_BILLING_TO_PUBLISH,
  ALREADY_APPLIED_MESSAGE,
  APPLICATIONS_CLOSED,
  CANCELLATION_NOT_POSSIBLE_AFTER_ADVANCE,
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

  it.each(['CONFIRMED', 'COMMISSION_PAID'] as DealStatus[])('%s: cancel only', (status) => {
    expect(summary({ status })).toEqual([['CANCEL', true, null]]);
  });

  it.each(['ADVANCE_PAID', 'CONTENT_UPLOADED', 'REVISION_REQUESTED', 'APPROVED'] as DealStatus[])(
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
