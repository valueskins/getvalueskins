import type { PayoutAccountStatus, UserRole } from './enums.js';

/** Steps in the order they are asked (SPEC 6.4, V0_LAUNCH 2.2). */
export const ONBOARDING_STEPS = [
  'instagram_username',
  'role',
  'email',
  'billing',
  'payout',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingInput {
  /** True once an Instagram account is linked (Instagram sign-in, or linked later). */
  hasInstagram: boolean;
  role: UserRole | null;
  emailVerified: boolean;
  hasBilling: boolean;
  /** True once an email-only account has typed its Instagram username. */
  instagramUsernameSet: boolean;
  payoutStatus: PayoutAccountStatus | null;
}

export interface OnboardingStepState {
  id: OnboardingStep;
  done: boolean;
  /** Required steps gate onboarding_completed_at. Payout is a step but not required (SPEC 6.4). */
  required: boolean;
}

export interface OnboardingState {
  completed: boolean;
  /** First required step that is not done, or null when onboarding is complete. */
  nextStep: OnboardingStep | null;
  /** Only the steps that apply to this user, in order. */
  steps: OnboardingStepState[];
}

/**
 * Pure: which onboarding steps apply to a user, which are done, and which is
 * next. Used by the API (to set onboarding_completed_at and to answer GET /me)
 * and by the web app. Both sign-in methods are covered: an email-only account
 * has a verified email already and instead types an Instagram username; an
 * Instagram account has no username step and verifies an email.
 */
export function computeOnboarding(input: OnboardingInput): OnboardingState {
  const steps: OnboardingStepState[] = [];

  if (!input.hasInstagram) {
    steps.push({ id: 'instagram_username', done: input.instagramUsernameSet, required: true });
  }
  steps.push({ id: 'role', done: input.role !== null, required: true });
  steps.push({ id: 'email', done: input.emailVerified, required: true });
  if (input.role === 'BRAND') {
    steps.push({ id: 'billing', done: input.hasBilling, required: true });
  }
  if (input.role === 'CREATOR') {
    steps.push({ id: 'payout', done: input.payoutStatus === 'ACTIVE', required: false });
  }

  const nextRequired = steps.find((step) => step.required && !step.done);

  return {
    completed: nextRequired === undefined,
    nextStep: nextRequired?.id ?? null,
    steps,
  };
}
