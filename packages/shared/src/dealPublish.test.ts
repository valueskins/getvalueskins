import { describe, expect, it } from 'vitest';
import { validateDealForPublish, type DealPublishFields } from './dealPublish.js';

// 2026-10-09 10:00 IST
const NOW = new Date('2026-10-09T04:30:00Z');

const READY: DealPublishFields = {
  title: '3 Instagram posts',
  description: 'Content type: 3 posts',
  budgetPaise: 10_000_00,
  applicationDeadline: '2026-10-12',
  contentUploadDeadline: '2026-10-20',
  dealDeadline: '2026-10-25',
};

function paths(deal: Partial<DealPublishFields>, now = NOW): string[] {
  return validateDealForPublish({ ...READY, ...deal }, now).map((i) => i.path);
}

describe('validateDealForPublish', () => {
  it('accepts a complete deal', () => {
    expect(validateDealForPublish(READY, NOW)).toEqual([]);
  });

  it('reports every missing field at once', () => {
    const issues = validateDealForPublish(
      {
        title: null,
        description: null,
        budgetPaise: null,
        applicationDeadline: null,
        contentUploadDeadline: null,
        dealDeadline: null,
      },
      NOW,
    );
    expect(issues.map((i) => i.path)).toEqual([
      'title',
      'description',
      'budgetRupees',
      'applicationDeadline',
      'contentUploadDeadline',
      'dealDeadline',
    ]);
  });

  it('treats blank title and description as missing', () => {
    expect(paths({ title: '   ', description: '' })).toEqual(['title', 'description']);
  });

  describe('budget', () => {
    it('accepts exactly the minimum', () => {
      expect(paths({ budgetPaise: 5_000_00 })).toEqual([]);
    });
    it('rejects one rupee under the minimum', () => {
      expect(paths({ budgetPaise: 4_999_00 })).toEqual(['budgetRupees']);
    });
    it('rejects paise that are not whole rupees', () => {
      expect(paths({ budgetPaise: 10_000_50 })).toEqual(['budgetRupees']);
    });
  });

  describe('deadlines are in the future (end of day IST)', () => {
    it('allows today for the application deadline', () => {
      expect(paths({ applicationDeadline: '2026-10-09' })).toEqual([]);
    });
    it('rejects yesterday', () => {
      expect(paths({ applicationDeadline: '2026-10-08' })).toEqual(['applicationDeadline']);
    });
    it('rejects today once 23:59:59 IST has passed', () => {
      const after = new Date('2026-10-09T18:30:00Z');
      expect(paths({ applicationDeadline: '2026-10-09' }, after)).toEqual(['applicationDeadline']);
    });
    it('rejects a past content upload and deal deadline', () => {
      expect(
        paths({
          applicationDeadline: '2026-10-09',
          contentUploadDeadline: '2026-10-08',
          dealDeadline: '2026-10-08',
        }),
      ).toEqual(['contentUploadDeadline', 'dealDeadline']);
    });
  });

  describe('deadline order: application < content upload <= deal', () => {
    it('rejects an application deadline equal to the content upload deadline', () => {
      expect(paths({ applicationDeadline: '2026-10-20' })).toEqual(['contentUploadDeadline']);
    });
    it('rejects an application deadline after the content upload deadline', () => {
      expect(paths({ applicationDeadline: '2026-10-21' })).toEqual(['contentUploadDeadline']);
    });
    it('accepts content upload equal to the deal deadline', () => {
      expect(paths({ dealDeadline: '2026-10-20' })).toEqual([]);
    });
    it('rejects a deal deadline before the content upload deadline', () => {
      expect(paths({ dealDeadline: '2026-10-19' })).toEqual(['dealDeadline']);
    });
  });
});
