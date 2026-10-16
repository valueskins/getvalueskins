import { describe, expect, it } from 'vitest';
import {
  FEE_NOT_DUE,
  ONLY_BRANDS_CAN,
  PAYMENT_COULD_NOT_BE_CONFIRMED,
  feeCapturedDealChangedMessage,
} from '@valueskins/shared';
import { ApiError } from '@/lib/api/client';
import { parseBrief } from '@/lib/brief';
import { closingToday, countdown, isNew, longDate, shortDate } from '@/lib/deadlines';
import { dealErrorText } from '@/lib/dealErrors';
import { currentStepNumber, dealStep, dealSteps } from '@/lib/dealStatus';
import { groupRupees, sameFields } from '@/lib/draftStore';
import { actionOf, lastNotReceived, pendingRecord, reasonOf, viewerOf } from '@/lib/dealView';
import { act, BRAND, CREATOR, makeDeal, record } from './helpers/deals';
import { makeMe } from './helpers/fixtures';

// The 9-step bar itself is tested in packages/shared (dealSteps.test.ts). Here: the web uses it.
describe('the 9 steps', () => {
  it('comes from shared, with the deal page fixture', () => {
    expect(currentStepNumber(dealSteps(makeDeal('COMMISSION_PAID')))).toBe(4);
    expect(dealStep('REVISION_REQUESTED')).toBe(6);
    expect(dealStep('CANCELLED')).toBeNull();
  });
});

describe('deadlines', () => {
  // A deadline is 23:59:59 IST, which is 18:29:59 UTC on that day.
  it('counts days, then hours under a day, then overdue', () => {
    expect(countdown('2026-10-10', new Date('2026-10-02T06:30:00Z'))).toMatchObject({
      text: '9 days left',
      overdue: false,
    });
    expect(countdown('2026-10-10', new Date('2026-10-10T11:30:00Z'))).toMatchObject({
      text: '7 hours left',
      soon: true,
    });
    expect(countdown('2026-10-10', new Date('2026-10-12T19:00:00Z'))).toMatchObject({
      text: 'Overdue by 2 days',
      overdue: true,
    });
    expect(countdown('2026-10-10', new Date('2026-10-10T20:00:00Z')).text).toBe(
      'Overdue by 1 hour',
    );
  });

  it('flags the closing day and new deals', () => {
    expect(closingToday('2026-10-02', new Date('2026-10-02T11:30:00Z'))).toBe(
      'Applications close today, 7 hours left',
    );
    expect(closingToday('2026-10-05', new Date('2026-10-02T11:30:00Z'))).toBeNull();
    expect(isNew('2026-10-02T00:00:00Z', new Date('2026-10-02T20:00:00Z'))).toBe(true);
    expect(isNew('2026-09-30T00:00:00Z', new Date('2026-10-02T20:00:00Z'))).toBe(false);
  });

  it('formats compact and long dates', () => {
    expect(shortDate('2026-10-02')).toBe('2 Oct');
    expect(longDate('2026-09-30')).toBe('30 Sep 2026');
  });
});

describe('the brief', () => {
  it('splits template lines into labelled items and keeps free text', () => {
    expect(
      parseBrief(
        'Content type: 1 reel\nShooting: At home\n\nAdditional notes:\nWe send the kurtas.',
      ),
    ).toEqual([
      { kind: 'item', label: 'Content type', text: '1 reel' },
      { kind: 'item', label: 'Shooting', text: 'At home' },
      { kind: 'text', text: 'Additional notes:\nWe send the kurtas.' },
    ]);
    expect(parseBrief('Just a plain brief.')).toEqual([
      { kind: 'text', text: 'Just a plain brief.' },
    ]);
  });
});

describe('deal errors in plain words', () => {
  const err = (code: string, message = '', retryAfter: number | null = null) =>
    new ApiError({ status: 409, code, message, retryAfter });

  it('turns a lost race into "this deal just changed" and asks for a reload', () => {
    expect(dealErrorText(err('INVALID_TRANSITION', 'Cannot move from CONTENT_UPLOADED'))).toEqual({
      title: 'This deal just changed',
      text: 'We reloaded it so you see the latest.',
      reload: true,
    });
  });

  it('says how long to wait from Retry-After, and words the dispute limit', () => {
    expect(dealErrorText(err('RATE_LIMITED', 'Too many requests', 1200), 'record').text).toBe(
      'Wait 20 minutes, then try again. Nothing was recorded.',
    );
    expect(dealErrorText(err('RATE_LIMITED'), 'dispute').title).toBe(
      'You can raise 3 disputes on a deal in a day',
    );
  });

  it('shows the plain API message for role, payment and wrong-step errors, and re-reads the deal', () => {
    expect(dealErrorText(err('PAYMENT_AMOUNT_MISMATCH', PAYMENT_COULD_NOT_BE_CONFIRMED))).toEqual({
      title: PAYMENT_COULD_NOT_BE_CONFIRMED,
      reload: true,
    });
    expect(dealErrorText(err('WRONG_ROLE', ONLY_BRANDS_CAN)).title).toBe(ONLY_BRANDS_CAN);
    expect(dealErrorText(err('WRONG_DEAL_STATUS', FEE_NOT_DUE))).toMatchObject({
      title: FEE_NOT_DUE,
      reload: true,
    });
    const changed = feeCapturedDealChangedMessage(88_500);
    expect(dealErrorText(err('FEE_CAPTURED_DEAL_CHANGED', changed)).title).toBe(changed);
  });

  it('keeps the API wording for a record already made', () => {
    expect(
      dealErrorText(
        err('DIRECT_PAYMENT_ALREADY_RECORDED', 'A payment is already recorded for this stage'),
      ).text,
    ).toBe('Your second entry was not saved.');
  });
});

describe('deal view helpers', () => {
  it('knows who is looking', () => {
    const deal = makeDeal('CONFIRMED');
    expect(
      viewerOf(deal, {
        ...makeMe({ role: 'BRAND' }),
        user: { ...makeMe({ role: 'BRAND' }).user, id: BRAND.id },
      }),
    ).toBe('brand');
    expect(viewerOf(deal, { ...makeMe(), user: { ...makeMe().user, id: CREATOR.id } })).toBe(
      'creator',
    );
    expect(viewerOf(deal, makeMe())).toBe('other');
  });

  it('reads actions and reasons as sent', () => {
    const deal = makeDeal('OPEN', { allowedActions: [act('APPLY', 'Applications closed')] });
    expect(reasonOf(actionOf(deal, 'APPLY'))).toBe('Applications closed');
    expect(actionOf(deal, 'CANCEL')).toBeUndefined();
  });

  it('finds the record waiting for the creator, and the last one not received', () => {
    const waiting = record();
    const disputed = record({ id: 'r-old', status: 'DISPUTED', disputeReason: 'Nothing arrived' });
    expect(
      pendingRecord(makeDeal('COMMISSION_PAID', { directPayments: [disputed, waiting] })),
    ).toEqual(waiting);
    expect(lastNotReceived(makeDeal('COMMISSION_PAID', { directPayments: [disputed] }))).toEqual(
      disputed,
    );
    // A final-stage record is not the advance's.
    expect(
      pendingRecord(makeDeal('COMMISSION_PAID', { directPayments: [record({ stage: 'FINAL' })] })),
    ).toBeNull();
  });
});

describe('the draft store helpers', () => {
  it('groups rupees the Indian way and compares fields', () => {
    expect(groupRupees('1000000')).toBe('10,00,000');
    expect(groupRupees('')).toBe('');
    const f = {
      title: 'a',
      description: '',
      budget: '5000',
      applicationDeadline: null,
      contentUploadDeadline: null,
      dealDeadline: null,
    };
    expect(sameFields(f, { ...f })).toBe(true);
    expect(sameFields(f, { ...f, budget: '6000' })).toBe(false);
  });
});
