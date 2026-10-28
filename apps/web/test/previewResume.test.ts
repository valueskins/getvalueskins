import { describe, expect, it } from 'vitest';
import { previewResume } from '@/lib/previewResume';
import { makeMe } from './helpers/fixtures';

const now = new Date('2026-10-28T06:00:00.000Z');

describe('previewResume', () => {
  it('builds the card from Instagram and what is typed, with no record yet', () => {
    const me = makeMe({ role: 'CREATOR', done: ['email'] });
    const card = previewResume(
      me,
      { name: '  Asha  ', city: 'Pune', age: 24, gender: 'FEMALE', website: 'x', pitch: 'y' },
      now,
    );
    expect(card.user).toMatchObject({
      role: 'CREATOR',
      name: 'Asha',
      city: 'Pune',
      age: 24,
      gender: 'FEMALE',
      website: null,
      pitch: null,
      followersCount: me.profile?.followersCount ?? null,
      memberSince: now.toISOString(),
    });
    expect(card.stats).toEqual({ completedDealsCount: 0, totalValuePaise: 0 });
    expect(card.completedDeals).toEqual([]);
  });

  it('shows only the verified email as the contact, and leaves out what a brand does not have', () => {
    const brand = makeMe({
      role: 'BRAND',
      done: [],
      email: 'pending@example.test',
      emailVerified: false,
    });
    const card = previewResume(
      brand,
      { name: '', city: '', age: 30, gender: 'MALE', website: 'https://brand.example', pitch: '' },
      now,
    );
    expect(card.user.contactEmail).toBeNull();
    expect(card.user.age).toBeNull();
    expect(card.user.gender).toBeNull();
    expect(card.user.website).toBe('https://brand.example');
    expect(card.user.pitch).toBeNull();
    // Nothing typed yet: the name falls back to the Instagram name.
    expect(card.user.name).toBe(brand.profile?.name ?? brand.user.username);
  });
});
