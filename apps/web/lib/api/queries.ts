'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AppConfigResponse,
  BrandProfileInput,
  CreatorProfileInput,
  DealMineResponse,
  MeBillingInput,
  MeBillingResponse,
  MeOnboarding,
  MePayoutUpiInput,
  MePayoutUpiResponse,
  MePayoutUpiSaveResponse,
  MeProfileSaveResponse,
  MeResponse,
  ResumeResponse,
} from '@valueskins/shared';
import { api, ApiError } from './client';

export const queryKeys = {
  me: ['me'] as const,
  config: ['config'] as const,
  payoutUpi: ['me', 'payout-upi'] as const,
  billing: ['me', 'billing'] as const,
  resume: (userId: string) => ['resume', userId] as const,
  dealsInProgress: ['deals', 'mine', 'in-progress'] as const,
};

/** Statuses of a deal that has a confirmed creator and is not finished. */
const IN_PROGRESS =
  'CONFIRMED,COMMISSION_PAID,ADVANCE_PAID,CONTENT_UPLOADED,REVISION_REQUESTED,APPROVED';

/** The signed-in user, or null when signed out (a 401 is not an error here). */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<MeResponse | null> => {
      try {
        return await api<MeResponse>('GET', '/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 30_000,
  });
}

export function useConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: () => api<AppConfigResponse>('GET', '/config'),
    staleTime: 5 * 60_000,
  });
}

export function usePayoutUpi(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.payoutUpi,
    queryFn: () => api<MePayoutUpiResponse>('GET', '/me/payout-upi'),
    enabled,
  });
}

export function useBilling(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.billing,
    queryFn: () => api<MeBillingResponse>('GET', '/me/billing'),
    enabled,
  });
}

export function useResume(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.resume(userId),
    queryFn: () => api<ResumeResponse>('GET', `/users/${encodeURIComponent(userId)}/resume`),
    enabled,
    staleTime: 5 * 60_000,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
}

export function useDealsInProgress(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.dealsInProgress,
    queryFn: () => api<DealMineResponse>('GET', `/deals/mine?status=${IN_PROGRESS}&limit=50`),
    enabled,
  });
}

/** Writes the fields a save returns into the cached GET /me, so pages move on without a refetch. */
function patchMe(
  client: QueryClient,
  patch: Partial<Pick<MeResponse, 'onboarding' | 'profileDetails'>>,
) {
  client.setQueryData<MeResponse | null>(queryKeys.me, (me) => (me ? { ...me, ...patch } : me));
}

export function useStartEmail() {
  return useMutation({
    mutationFn: (email: string) => api<{ ok: true }>('POST', '/me/email', { email }),
  });
}

export function useResendEmail() {
  return useMutation({
    mutationFn: () => api<{ ok: true }>('POST', '/me/email/resend'),
  });
}

/**
 * POST /me/email/verify (SPEC 6.4). Works signed in or not: the token decides whose email it is.
 * `onboarding` comes back only when this browser is signed in as that person.
 */
export interface VerifyEmailResult {
  verified: true;
  email: string;
  onboarding: MeOnboarding | null;
}

export function useVerifyEmail() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api<VerifyEmailResult>('POST', '/me/email/verify', { token }),
    // The verified address changes user.email too, so read GET /me again.
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useSaveProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatorProfileInput | BrandProfileInput) =>
      api<MeProfileSaveResponse>('PUT', '/me/profile', input),
    onSuccess: (data) =>
      patchMe(client, { profileDetails: data.profileDetails, onboarding: data.onboarding }),
  });
}

export function useSavePayoutUpi() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MePayoutUpiInput) =>
      api<MePayoutUpiSaveResponse>('PUT', '/me/payout-upi', input),
    onSuccess: (data) => {
      client.setQueryData<MePayoutUpiResponse>(queryKeys.payoutUpi, { payoutUpi: data.payoutUpi });
      patchMe(client, { onboarding: data.onboarding });
    },
  });
}

export function useSaveBilling() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MeBillingInput) =>
      api<MeBillingResponse & { onboarding: MeOnboarding }>('PUT', '/me/billing', input),
    onSuccess: (data) => {
      client.setQueryData<MeBillingResponse>(queryKeys.billing, { billing: data.billing });
      patchMe(client, { onboarding: data.onboarding });
    },
  });
}

/** Ends the session, then forgets everything cached for this user. */
export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>('POST', '/auth/logout'),
    onSettled: () => {
      client.clear();
      client.setQueryData(queryKeys.me, null);
    },
  });
}

export function useDeleteAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>('DELETE', '/me'),
    onSuccess: () => {
      client.clear();
      client.setQueryData(queryKeys.me, null);
    },
  });
}
