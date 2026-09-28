import { describe, expect, it } from 'vitest';
import { computeEngagementRate } from '../../src/instagram/client.js';

describe('computeEngagementRate (SPEC 6.1)', () => {
  it('is null with fewer than 3 posts', () => {
    const media = [
      { likeCount: 10, commentsCount: 1 },
      { likeCount: 20, commentsCount: 2 },
    ];
    expect(computeEngagementRate(media, 1000)).toBeNull();
  });

  it('is null with 0 followers', () => {
    const media = [
      { likeCount: 10, commentsCount: 1 },
      { likeCount: 20, commentsCount: 2 },
      { likeCount: 30, commentsCount: 3 },
    ];
    expect(computeEngagementRate(media, 0)).toBeNull();
  });

  it('computes the average (likes + comments) over followers, as a percentage with 2 decimals', () => {
    // 3 posts, engagement 100 + 100 + 100 = 300, average 100, /1000 followers *100 = 10.00%
    const media = [
      { likeCount: 90, commentsCount: 10 },
      { likeCount: 80, commentsCount: 20 },
      { likeCount: 70, commentsCount: 30 },
    ];
    expect(computeEngagementRate(media, 1000)).toBe(10);
  });

  it('rounds to 2 decimals', () => {
    const media = [
      { likeCount: 1, commentsCount: 0 },
      { likeCount: 1, commentsCount: 0 },
      { likeCount: 1, commentsCount: 0 },
    ];
    // average engagement = 1, followers = 7 -> (1/7)*100 = 14.2857...
    expect(computeEngagementRate(media, 7)).toBe(14.29);
  });
});
