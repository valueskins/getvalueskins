'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  AdminDealDetailResponse,
  AdminDealListItem,
  AdminDealListResponse,
  AdminDisputeDetailResponse,
  AdminDisputeListResponse,
  AdminEmail as SharedAdminEmail,
  AdminPayment as SharedAdminPayment,
  DealDetail,
  DealStatus,
  DisputeResponse,
  DisputeStatus,
  DisputeView,
  ResendEmailResponse,
} from '@valueskins/shared';
import { api } from './client';

// The admin responses are shared schemas (packages/shared/src/schemas/admin.ts, SPEC 12); these
// names are the web's short aliases for them.
export type AdminDealItem = AdminDealListItem;
export type AdminDealList = AdminDealListResponse;
export type AdminPayment = SharedAdminPayment;
export type AdminEmail = SharedAdminEmail;
export type AdminDispute = DisputeView;
export type AdminDealDetail = AdminDealDetailResponse;
export type AdminDisputeList = AdminDisputeListResponse;
export type AdminDisputeDetail = AdminDisputeDetailResponse;
export type ResendResult = ResendEmailResponse;

export interface AdminDealFilter {
  status: DealStatus | '';
  q: string;
}

export const ADMIN_PAGE = 20;

export const adminKeys = {
  all: ['admin'] as const,
  deals: (filter: AdminDealFilter, cursor: string | null) =>
    ['admin', 'deals', filter.status, filter.q, cursor] as const,
  deal: (id: string) => ['admin', 'deal', id] as const,
  disputes: (status: DisputeStatus, cursor: string | null) =>
    ['admin', 'disputes', status, cursor] as const,
  dispute: (id: string) => ['admin', 'dispute', id] as const,
};

function query(params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : '';
}

// ---- Queries ----

export function useAdminDeals(filter: AdminDealFilter, cursor: string | null) {
  return useQuery({
    queryKey: adminKeys.deals(filter, cursor),
    queryFn: () =>
      api<AdminDealList>(
        'GET',
        `/admin/deals${query({
          status: filter.status,
          q: filter.q.trim(),
          limit: String(ADMIN_PAGE),
          cursor,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useAdminDeal(id: string, enabled = true) {
  return useQuery({
    queryKey: adminKeys.deal(id),
    queryFn: () => api<AdminDealDetail>('GET', `/admin/deals/${id}`),
    enabled: enabled && Boolean(id),
  });
}

export function useAdminDisputes(status: DisputeStatus, cursor: string | null) {
  return useQuery({
    queryKey: adminKeys.disputes(status, cursor),
    queryFn: () =>
      api<AdminDisputeList>(
        'GET',
        `/admin/disputes${query({ status, limit: String(ADMIN_PAGE), cursor })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useAdminDispute(id: string) {
  return useQuery({
    queryKey: adminKeys.dispute(id),
    queryFn: () => api<AdminDisputeDetail>('GET', `/admin/disputes/${id}`),
  });
}

// ---- Mutations ----

/** Every admin action can change a deal, a dispute and the lists, so all of them are re-read. */
export function refreshAdmin(client: QueryClient) {
  void client.invalidateQueries({ queryKey: adminKeys.all });
}

export function useAdminCancel(dealId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { note: string; refundReference?: string }) =>
      api<{ deal: DealDetail }>('POST', `/admin/deals/${dealId}/cancel`, input),
    onSettled: () => refreshAdmin(client),
  });
}

export function useAdminResend() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (emailId: string) => api<ResendResult>('POST', `/admin/emails/${emailId}/resend`),
    onSettled: () => refreshAdmin(client),
  });
}

export function useResolveDispute(disputeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { resolution: string; refundReference?: string }) =>
      api<DisputeResponse>('POST', `/admin/disputes/${disputeId}/resolve`, input),
    onSettled: () => refreshAdmin(client),
  });
}
