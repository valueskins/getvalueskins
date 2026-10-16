import { describe, expect, it } from 'vitest';
import { DEAL_STATUSES, type DealStatus } from './dealStateMachine.js';
import {
  currentStepNumber,
  dealStep,
  dealSteps,
  STEP_LABELS,
  type StepDates,
} from './dealSteps.js';

const T = {
  publishedAt: '2026-10-01T02:35:00.000Z',
  confirmedAt: '2026-10-02T05:50:00.000Z',
  commissionPaidAt: '2026-10-02T06:04:00.000Z',
  advancePaidAt: '2026-10-03T08:45:00.000Z',
  contentUploadedAt: '2026-10-05T10:00:00.000Z',
  approvedAt: '2026-10-11T04:30:00.000Z',
  completedAt: '2026-10-11T12:35:00.000Z',
};

const NONE = {
  publishedAt: null,
  confirmedAt: null,
  commissionPaidAt: null,
  advancePaidAt: null,
  contentUploadedAt: null,
  approvedAt: null,
  completedAt: null,
};

/** A deal in `status` with every timestamp a deal in that status would have. */
function at(status: DealStatus, over: Partial<StepDates> = {}): StepDates {
  const order: Array<keyof typeof T> = [
    'publishedAt',
    'confirmedAt',
    'commissionPaidAt',
    'advancePaidAt',
    'contentUploadedAt',
    'approvedAt',
    'completedAt',
  ];
  const reached: Record<Exclude<DealStatus, 'CANCELLED'>, number> = {
    DRAFT: 0,
    OPEN: 1,
    CONFIRMED: 2,
    COMMISSION_PAID: 3,
    ADVANCE_PAID: 4,
    CONTENT_UPLOADED: 5,
    REVISION_REQUESTED: 5,
    APPROVED: 6,
    COMPLETED: 7,
  };
  const n = status === 'CANCELLED' ? 0 : reached[status];
  const dates = Object.fromEntries(order.map((k, i) => [k, i < n ? T[k] : null]));
  return { ...NONE, ...dates, status, ...over } as StepDates;
}

const states = (d: StepDates) => dealSteps(d).map((s) => s.state);

describe('dealStep', () => {
  it('maps every status to a step on the 9-step bar, and CANCELLED to none', () => {
    const expected: Record<DealStatus, number | null> = {
      DRAFT: 1,
      OPEN: 2,
      CONFIRMED: 3,
      COMMISSION_PAID: 4,
      ADVANCE_PAID: 5,
      CONTENT_UPLOADED: 6,
      REVISION_REQUESTED: 6,
      APPROVED: 8,
      COMPLETED: 9,
      CANCELLED: null,
    };
    for (const status of DEAL_STATUSES) expect(dealStep(status)).toBe(expected[status]);
  });

  it('agrees with the bar for every live status', () => {
    for (const status of DEAL_STATUSES) {
      if (status === 'CANCELLED') continue;
      expect(currentStepNumber(dealSteps(at(status)))).toBe(dealStep(status));
    }
  });

  it('has 9 labels', () => {
    expect(STEP_LABELS).toHaveLength(9);
  });
});

describe('dealSteps', () => {
  it('marks done, current and to do from the status', () => {
    expect(states(at('OPEN'))).toEqual([
      'done',
      'current',
      'todo',
      'todo',
      'todo',
      'todo',
      'todo',
      'todo',
      'todo',
    ]);
    expect(states(at('COMPLETED')).every((s) => s === 'done')).toBe(true);
  });

  it('keeps changes requested on Review, never moving back', () => {
    expect(states(at('REVISION_REQUESTED'))).toEqual(states(at('CONTENT_UPLOADED')));
  });

  it('stops a cancelled deal where its timestamps end, at every point', () => {
    const cases: Array<[Partial<StepDates>, number]> = [
      [{}, 1],
      [{ publishedAt: T.publishedAt }, 2],
      [{ publishedAt: T.publishedAt, confirmedAt: T.confirmedAt }, 3],
      [
        { ...T, advancePaidAt: null, contentUploadedAt: null, approvedAt: null, completedAt: null },
        4,
      ],
      [{ ...T, contentUploadedAt: null, approvedAt: null, completedAt: null }, 5],
      [{ ...T, approvedAt: null, completedAt: null }, 6],
      [{ ...T, completedAt: null }, 8],
    ];
    for (const [dates, stoppedAt] of cases) {
      const steps = dealSteps({ ...NONE, ...dates, status: 'CANCELLED' });
      expect(currentStepNumber(steps)).toBe(stoppedAt);
      expect(steps[stoppedAt - 1]!.state).toBe('stopped');
      expect(steps.slice(stoppedAt).every((s) => s.state === 'void')).toBe(true);
    }
  });

  it('dates the finished steps only', () => {
    const steps = dealSteps(at('COMMISSION_PAID'));
    expect(steps[0]!.at).toBe(T.publishedAt);
    expect(steps[2]!.at).toBe(T.commissionPaidAt);
    expect(steps[3]!.at).toBeNull();
  });
});
