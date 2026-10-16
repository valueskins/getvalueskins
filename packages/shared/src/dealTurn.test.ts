import { describe, expect, it } from 'vitest';
import { computeDealActions, type DealActionsInput } from './dealActions.js';
import { DEAL_NEXT_STEPS, computeDealTurn, dueStageFor, isYourTurn } from './dealTurn.js';
import { DEAL_STATUSES, type DealStatus } from './dealStateMachine.js';

describe('computeDealTurn', () => {
  const turn = (status: DealStatus, applicantCount = 1, pendingRecord = false) =>
    computeDealTurn({ status, applicantCount, pendingRecord });

  it.each([
    ['DRAFT', 'PUBLISH', 'BRAND'],
    ['CONFIRMED', 'PAY_FEE', 'BRAND'],
    ['ADVANCE_PAID', 'UPLOAD_CONTENT', 'CREATOR'],
    ['CONTENT_UPLOADED', 'REVIEW_CONTENT', 'BRAND'],
    ['REVISION_REQUESTED', 'UPLOAD_CONTENT', 'CREATOR'],
  ] as const)('%s: %s by the %s', (status, nextStep, actor) => {
    expect(turn(status)).toEqual({ nextStep, actor });
  });

  it('OPEN: the brand confirms once there are applicants, until then nobody', () => {
    expect(turn('OPEN', 2)).toEqual({ nextStep: 'CONFIRM_CREATOR', actor: 'BRAND' });
    expect(turn('OPEN', 0)).toEqual({ nextStep: 'WAIT_FOR_APPLICANTS', actor: null });
  });

  it.each([
    ['COMMISSION_PAID', 'PAY_ADVANCE'],
    ['APPROVED', 'PAY_FINAL'],
  ] as const)(
    '%s: the brand pays (%s), the creator confirms once a payment is recorded',
    (status, pay) => {
      expect(turn(status, 0, false)).toEqual({ nextStep: pay, actor: 'BRAND' });
      expect(turn(status, 0, true)).toEqual({ nextStep: 'CONFIRM_PAYMENT', actor: 'CREATOR' });
    },
  );

  it('COMPLETED and CANCELLED: nobody', () => {
    expect(turn('COMPLETED')).toEqual({ nextStep: null, actor: null });
    expect(turn('CANCELLED')).toEqual({ nextStep: null, actor: null });
  });

  it('every next step is a known code', () => {
    for (const status of DEAL_STATUSES) {
      for (const pendingRecord of [false, true]) {
        for (const applicantCount of [0, 3]) {
          const { nextStep } = turn(status, applicantCount, pendingRecord);
          if (nextStep !== null) expect(DEAL_NEXT_STEPS).toContain(nextStep);
        }
      }
    }
  });

  it('isYourTurn is true only for the actor', () => {
    expect(isYourTurn(turn('CONFIRMED'), 'BRAND')).toBe(true);
    expect(isYourTurn(turn('CONFIRMED'), 'CREATOR')).toBe(false);
    expect(isYourTurn(turn('COMPLETED'), 'BRAND')).toBe(false);
    expect(isYourTurn(turn('COMPLETED'), 'CREATOR')).toBe(false);
  });
});

describe('dueStageFor', () => {
  it('is the advance while the fee is paid and the final once approved', () => {
    expect(dueStageFor('COMMISSION_PAID')).toBe('ADVANCE');
    expect(dueStageFor('APPROVED')).toBe('FINAL');
    for (const status of DEAL_STATUSES) {
      if (status !== 'COMMISSION_PAID' && status !== 'APPROVED') {
        expect(dueStageFor(status)).toBeNull();
      }
    }
  });
});

/**
 * The turn table and the permission rule must not drift: whoever the table names has an enabled
 * "doing" action in computeDealActions, and the other party has none. The only gaps are the
 * documented blocked cases, where the action is listed but disabled with a reason.
 */
describe('computeDealTurn agrees with computeDealActions', () => {
  const DOING = new Set([
    'PUBLISH',
    'CONFIRM_CREATOR',
    'PAY_COMMISSION',
    'PAY_ADVANCE',
    'PAY_FINAL',
    'CONFIRM_PAYMENT_RECEIVED',
    'UPLOAD_CONTENT',
    'SEND_FEEDBACK',
    'APPROVE',
  ]);

  const actionsFor = (
    viewer: DealActionsInput['viewer'],
    status: DealStatus,
    applicantCount: number,
    pendingRecord: boolean,
  ) =>
    computeDealActions({
      status,
      viewer,
      applicationsOpen: true,
      applicationCount: applicantCount,
      hasApplied: false,
      payoutSet: true,
      uploadCount: 1,
      hasCreator: status !== 'DRAFT' && status !== 'OPEN',
      creatorPayout: 'SET',
      hasOpenDispute: false,
      pendingRecord,
      hasBilling: true,
      publishIssues: [],
      paymentsOpen: true,
      postingOpen: true,
    }).filter((a) => a.enabled && DOING.has(a.action));

  for (const status of DEAL_STATUSES) {
    for (const pendingRecord of [false, true]) {
      for (const applicantCount of [0, 2]) {
        // A pending record only exists while a payment is due.
        if (pendingRecord && status !== 'COMMISSION_PAID' && status !== 'APPROVED') continue;
        it(`${status}, ${applicantCount} applicants, pending record ${pendingRecord}`, () => {
          const t = computeDealTurn({ status, applicantCount, pendingRecord });
          const brand = actionsFor('BRAND_OWNER', status, applicantCount, pendingRecord);
          const creator = actionsFor('CONFIRMED_CREATOR', status, applicantCount, pendingRecord);
          expect(brand.length > 0).toBe(isYourTurn(t, 'BRAND'));
          expect(creator.length > 0).toBe(isYourTurn(t, 'CREATOR'));
          // Never both at once.
          expect(brand.length > 0 && creator.length > 0).toBe(false);
        });
      }
    }
  }
});
