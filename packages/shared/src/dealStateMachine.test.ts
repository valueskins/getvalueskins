import { describe, expect, it } from 'vitest';
import {
  ACTOR_ROLES,
  DEAL_STATUSES,
  DEAL_TRANSITIONS,
  applicationsOpen,
  canTransition,
  contentOverdue,
  endOfDayIST,
  todayIST,
  type ActorRole,
  type DealStatus,
} from './dealStateMachine.js';

describe('canTransition: every allowed transition', () => {
  const cases: Array<[DealStatus, DealStatus, ActorRole]> = [
    ['DRAFT', 'OPEN', 'BRAND'],
    ['OPEN', 'CONFIRMED', 'BRAND'],
    ['OPEN', 'CANCELLED', 'BRAND'],
    ['CONFIRMED', 'COMMISSION_PAID', 'SYSTEM'],
    ['CONFIRMED', 'CANCELLED', 'BRAND'],
    ['COMMISSION_PAID', 'ADVANCE_PAID', 'CREATOR'],
    ['ADVANCE_PAID', 'CONTENT_UPLOADED', 'CREATOR'],
    ['CONTENT_UPLOADED', 'REVISION_REQUESTED', 'BRAND'],
    ['CONTENT_UPLOADED', 'APPROVED', 'BRAND'],
    ['REVISION_REQUESTED', 'CONTENT_UPLOADED', 'CREATOR'],
    ['APPROVED', 'COMPLETED', 'CREATOR'],
    ['COMMISSION_PAID', 'CANCELLED', 'ADMIN'],
    ['ADVANCE_PAID', 'CANCELLED', 'ADMIN'],
    ['CONTENT_UPLOADED', 'CANCELLED', 'ADMIN'],
    ['REVISION_REQUESTED', 'CANCELLED', 'ADMIN'],
    ['APPROVED', 'CANCELLED', 'ADMIN'],
  ];

  it('has exactly 16 rows in the transition table', () => {
    expect(DEAL_TRANSITIONS).toHaveLength(16);
  });

  it.each(cases)('allows %s -> %s for %s', (from, to, role) => {
    expect(canTransition(from, to, role)).toBe(true);
  });

  it.each(cases)(
    'rejects %s -> %s for every role that has no row for it (not %s)',
    (from, to, row) => {
      // A pair can have more than one row (OPEN -> CANCELLED has only the brand; later stages only an admin).
      const allowed = cases.filter((c) => c[0] === from && c[1] === to).map((c) => c[2]);
      expect(allowed).toContain(row);
      for (const role of ACTOR_ROLES) {
        if (allowed.includes(role)) continue;
        expect(canTransition(from, to, role)).toBe(false);
      }
    },
  );
});

describe('cancelling (REPLACEMENT_PLAN 2.6)', () => {
  it('a brand can cancel only in OPEN and CONFIRMED', () => {
    for (const from of DEAL_STATUSES) {
      expect(canTransition(from, 'CANCELLED', 'BRAND')).toBe(
        from === 'OPEN' || from === 'CONFIRMED',
      );
    }
  });

  it('a creator and the system never cancel', () => {
    for (const from of DEAL_STATUSES) {
      expect(canTransition(from, 'CANCELLED', 'CREATOR')).toBe(false);
      expect(canTransition(from, 'CANCELLED', 'SYSTEM')).toBe(false);
    }
  });

  it('an admin can cancel from COMMISSION_PAID to APPROVED only', () => {
    const allowed = [
      'COMMISSION_PAID',
      'ADVANCE_PAID',
      'CONTENT_UPLOADED',
      'REVISION_REQUESTED',
      'APPROVED',
    ];
    for (const from of DEAL_STATUSES) {
      expect(canTransition(from, 'CANCELLED', 'ADMIN')).toBe(allowed.includes(from));
    }
  });
});

describe('canTransition: exhaustive matrix', () => {
  it('matches DEAL_TRANSITIONS membership for every (from, to, role) combination', () => {
    let checked = 0;

    for (const from of DEAL_STATUSES) {
      for (const to of DEAL_STATUSES) {
        for (const role of ACTOR_ROLES) {
          const expected = DEAL_TRANSITIONS.some(
            (t) => t.from === from && t.to === to && t.roles.includes(role),
          );
          expect(canTransition(from, to, role)).toBe(expected);
          checked += 1;
        }
      }
    }

    expect(checked).toBe(DEAL_STATUSES.length * DEAL_STATUSES.length * ACTOR_ROLES.length);
  });
});

describe('endOfDayIST', () => {
  it('returns 23:59:59 IST as the equivalent UTC instant', () => {
    expect(endOfDayIST('2026-01-15').toISOString()).toBe('2026-01-15T18:29:59.000Z');
  });

  it('throws for an invalid calendar date', () => {
    expect(() => endOfDayIST('2026-02-30')).toThrow(RangeError);
  });

  it('throws for a malformed date string', () => {
    expect(() => endOfDayIST('15-01-2026')).toThrow(RangeError);
  });
});

describe('applicationsOpen', () => {
  const applicationDeadline = '2026-01-15';

  it('is true just before the deadline while OPEN', () => {
    const now = new Date('2026-01-15T18:29:58.000Z');
    expect(applicationsOpen({ status: 'OPEN', applicationDeadline }, now)).toBe(true);
  });

  it('is false exactly at 23:59:59 IST (strict less-than)', () => {
    const now = new Date('2026-01-15T18:29:59.000Z');
    expect(applicationsOpen({ status: 'OPEN', applicationDeadline }, now)).toBe(false);
  });

  it('is false just after the deadline (00:00:00 IST the next day)', () => {
    const now = new Date('2026-01-15T18:30:00.000Z');
    expect(applicationsOpen({ status: 'OPEN', applicationDeadline }, now)).toBe(false);
  });

  it('is always false when the deal is not OPEN, regardless of time', () => {
    const now = new Date('2026-01-15T18:29:58.000Z');
    expect(applicationsOpen({ status: 'DRAFT', applicationDeadline }, now)).toBe(false);
    expect(applicationsOpen({ status: 'CONFIRMED', applicationDeadline }, now)).toBe(false);
  });
});

describe('contentOverdue', () => {
  const contentUploadDeadline = '2026-01-15';

  it('is false just before the deadline', () => {
    const now = new Date('2026-01-15T18:29:58.000Z');
    expect(contentOverdue({ status: 'ADVANCE_PAID', contentUploadDeadline }, now)).toBe(false);
    expect(contentOverdue({ status: 'REVISION_REQUESTED', contentUploadDeadline }, now)).toBe(
      false,
    );
  });

  it('is false exactly at 23:59:59 IST (strict greater-than)', () => {
    const now = new Date('2026-01-15T18:29:59.000Z');
    expect(contentOverdue({ status: 'ADVANCE_PAID', contentUploadDeadline }, now)).toBe(false);
    expect(contentOverdue({ status: 'REVISION_REQUESTED', contentUploadDeadline }, now)).toBe(
      false,
    );
  });

  it('is true just after the deadline (00:00:00 IST the next day)', () => {
    const now = new Date('2026-01-15T18:30:00.000Z');
    expect(contentOverdue({ status: 'ADVANCE_PAID', contentUploadDeadline }, now)).toBe(true);
    expect(contentOverdue({ status: 'REVISION_REQUESTED', contentUploadDeadline }, now)).toBe(true);
  });

  it('is always false for a status not eligible for overdue, regardless of time', () => {
    const now = new Date('2026-01-15T18:30:00.000Z');
    expect(contentOverdue({ status: 'COMMISSION_PAID', contentUploadDeadline }, now)).toBe(false);
  });
});

describe('todayIST', () => {
  it('is the IST calendar date at the given instant', () => {
    expect(todayIST(new Date('2026-10-09T00:00:00Z'))).toBe('2026-10-09');
    // 18:29:59 UTC is still the same day in IST (23:59:59), 18:30:00 UTC is the next day
    expect(todayIST(new Date('2026-10-09T18:29:59Z'))).toBe('2026-10-09');
    expect(todayIST(new Date('2026-10-09T18:30:00Z'))).toBe('2026-10-10');
  });

  it('agrees with applicationsOpen at the deadline boundary', () => {
    const deadline = '2026-10-09';
    const lastOpen = new Date('2026-10-09T18:29:58Z');
    const closed = new Date('2026-10-09T18:30:00Z');
    expect(applicationsOpen({ status: 'OPEN', applicationDeadline: deadline }, lastOpen)).toBe(
      true,
    );
    expect(todayIST(lastOpen) <= deadline).toBe(true);
    expect(applicationsOpen({ status: 'OPEN', applicationDeadline: deadline }, closed)).toBe(false);
    expect(todayIST(closed) <= deadline).toBe(false);
  });
});
