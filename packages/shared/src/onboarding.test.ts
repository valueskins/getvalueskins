import { describe, expect, it } from 'vitest';
import { type OnboardingInput, computeOnboarding } from './onboarding.js';

const instagramUser: OnboardingInput = {
  hasInstagram: true,
  role: null,
  emailVerified: false,
  hasBilling: false,
  instagramUsernameSet: false,
  payoutStatus: null,
};

const emailUser: OnboardingInput = {
  hasInstagram: false,
  role: null,
  emailVerified: true,
  hasBilling: false,
  instagramUsernameSet: false,
  payoutStatus: null,
};

const ids = (input: OnboardingInput) => computeOnboarding(input).steps.map((s) => s.id);

describe('computeOnboarding: Instagram sign-in', () => {
  it('starts at role, then email, with no Instagram username step', () => {
    expect(ids(instagramUser)).toEqual(['role', 'email']);
    expect(computeOnboarding(instagramUser).nextStep).toBe('role');
    expect(computeOnboarding({ ...instagramUser, role: 'CREATOR' }).nextStep).toBe('email');
  });

  it('a creator with a verified email is complete, payout is optional', () => {
    const state = computeOnboarding({ ...instagramUser, role: 'CREATOR', emailVerified: true });

    expect(state.completed).toBe(true);
    expect(state.nextStep).toBeNull();
    expect(state.steps.map((s) => s.id)).toEqual(['role', 'email', 'payout']);
    expect(state.steps.find((s) => s.id === 'payout')).toEqual({
      id: 'payout',
      done: false,
      required: false,
    });
  });

  it('a brand also needs billing', () => {
    const noBilling = computeOnboarding({ ...instagramUser, role: 'BRAND', emailVerified: true });
    expect(noBilling.completed).toBe(false);
    expect(noBilling.nextStep).toBe('billing');

    const withBilling = computeOnboarding({
      ...instagramUser,
      role: 'BRAND',
      emailVerified: true,
      hasBilling: true,
    });
    expect(withBilling.completed).toBe(true);
  });
});

describe('computeOnboarding: email sign-in', () => {
  it('starts at the Instagram username, then role', () => {
    expect(ids(emailUser)).toEqual(['instagram_username', 'role', 'email']);
    expect(computeOnboarding(emailUser).nextStep).toBe('instagram_username');
    expect(computeOnboarding({ ...emailUser, instagramUsernameSet: true }).nextStep).toBe('role');
  });

  it('email is already done, so a creator is complete after username and role', () => {
    const state = computeOnboarding({
      ...emailUser,
      instagramUsernameSet: true,
      role: 'CREATOR',
    });
    expect(state.completed).toBe(true);
    expect(state.steps.find((s) => s.id === 'email')?.done).toBe(true);
  });

  it('a brand needs billing as well', () => {
    const state = computeOnboarding({ ...emailUser, instagramUsernameSet: true, role: 'BRAND' });
    expect(state.nextStep).toBe('billing');
  });

  it('linking Instagram removes the username step', () => {
    const state = computeOnboarding({ ...emailUser, hasInstagram: true, role: 'CREATOR' });
    expect(state.steps.map((s) => s.id)).not.toContain('instagram_username');
    expect(state.completed).toBe(true);
  });
});

describe('computeOnboarding: payout step', () => {
  it('is done only when the payout account is ACTIVE', () => {
    const base = { ...instagramUser, role: 'CREATOR' as const, emailVerified: true };
    const done = (payoutStatus: OnboardingInput['payoutStatus']) =>
      computeOnboarding({ ...base, payoutStatus }).steps.find((s) => s.id === 'payout')?.done;

    expect(done(null)).toBe(false);
    expect(done('PENDING')).toBe(false);
    expect(done('NEEDS_CLARIFICATION')).toBe(false);
    expect(done('SUSPENDED')).toBe(false);
    expect(done('ACTIVE')).toBe(true);
  });

  it('never appears for a brand or before a role is chosen', () => {
    expect(ids({ ...instagramUser, role: 'BRAND' })).not.toContain('payout');
    expect(ids(instagramUser)).not.toContain('payout');
  });
});
