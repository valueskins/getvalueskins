import { describe, expect, it } from 'vitest';
import { meResponseSchema } from './me.js';

const onboarding = {
  completed: false,
  nextStep: 'email',
  steps: [
    { id: 'role', done: true, required: true },
    { id: 'email', done: false, required: true },
  ],
};

const user = {
  id: '01a0e8e8-52b5-75d3-999f-4570bcd490e4',
  instagramUserId: 'ig-1',
  username: 'creator',
  role: 'CREATOR',
  isAdmin: false,
  onboardingCompletedAt: null,
  email: null,
  emailVerifiedAt: null,
};

describe('meResponseSchema', () => {
  it('accepts a user with an Instagram profile', () => {
    const result = meResponseSchema.safeParse({
      user,
      profile: {
        username: 'creator',
        name: 'Creator Name',
        profilePictureUrl: 'https://example.com/pic.jpg',
        followersCount: 5000,
        followsCount: 100,
        mediaCount: 40,
        engagementRate: 3.25,
        instagramSyncedAt: '2026-10-01T10:00:00.000Z',
      },
      onboarding,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an email-only user with a null profile', () => {
    const result = meResponseSchema.safeParse({
      user: { ...user, instagramUserId: null, role: null, email: 'a@example.com' },
      profile: null,
      onboarding,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a response with no profile key', () => {
    expect(meResponseSchema.safeParse({ user, onboarding }).success).toBe(false);
  });

  it('rejects an unknown role', () => {
    expect(
      meResponseSchema.safeParse({ user: { ...user, role: 'ADMIN' }, profile: null, onboarding })
        .success,
    ).toBe(false);
  });

  it('rejects a response with no onboarding object', () => {
    expect(meResponseSchema.safeParse({ user, profile: null }).success).toBe(false);
  });

  it('rejects an unknown onboarding step', () => {
    expect(
      meResponseSchema.safeParse({
        user,
        profile: null,
        onboarding: { ...onboarding, nextStep: 'marketplace' },
      }).success,
    ).toBe(false);
  });
});
