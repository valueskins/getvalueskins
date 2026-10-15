'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  DealApplicationListResponse,
  DealDetail,
  DealDetailResponse,
  DealEmailListResponse,
  DealEventListResponse,
  DealFeedResponse,
  DealMineResponse,
  DirectPaymentInfo,
  DirectPaymentStage,
  DirectPaymentView,
  MyApplicationListResponse,
  PaymentOrderResponse,
  PaymentVerifyInput,
  PaymentVerifyResponse,
} from '@valueskins/shared';
import { api } from './client';

export const dealKeys = {
  all: ['deal'] as const,
  deal: (id: string) => ['deal', id] as const,
  events: (id: string) => ['deal', id, 'events'] as const,
  emails: (id: string) => ['deal', id, 'emails'] as const,
  applications: (id: string) => ['deal', id, 'applications'] as const,
  directPayment: (id: string) => ['deal', id, 'direct-payment'] as const,
  feed: ['deals', 'feed'] as const,
  mine: (statuses: string) => ['deals', 'mine', statuses] as const,
  mineAll: ['deals', 'mine'] as const,
  myApplications: ['applications', 'mine'] as const,
};

/** The body of a draft save. Every field may be cleared with null. */
export interface DraftInput {
  title?: string | null;
  description?: string | null;
  budgetRupees?: number | null;
  applicationDeadline?: string | null;
  contentUploadDeadline?: string | null;
  dealDeadline?: string | null;
}

export interface DisputeInput {
  subject: string;
  description: string;
}

const PAGE = 20;

function withCursor(path: string, cursor: string | null): string {
  const sep = path.includes('?') ? '&' : '?';
  return cursor
    ? `${path}${sep}limit=${PAGE}&cursor=${encodeURIComponent(cursor)}`
    : `${path}${sep}limit=${PAGE}`;
}

// ---- Queries ----

export function useDeal(id: string) {
  return useQuery({
    queryKey: dealKeys.deal(id),
    queryFn: async () => (await api<DealDetailResponse>('GET', `/deals/${id}`)).deal,
  });
}

/** History is for the brand, the confirmed creator and admins only. */
export function useDealEvents(id: string, enabled: boolean) {
  return useQuery({
    queryKey: dealKeys.events(id),
    queryFn: async () =>
      (await api<DealEventListResponse>('GET', `/deals/${id}/events?limit=50`)).items,
    enabled,
  });
}

export function useDealEmails(id: string, enabled: boolean) {
  return useQuery({
    queryKey: dealKeys.emails(id),
    queryFn: async () =>
      (await api<DealEmailListResponse>('GET', `/deals/${id}/emails?limit=50`)).items,
    enabled,
  });
}

export function useDealApplications(id: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: dealKeys.applications(id),
    queryFn: ({ pageParam }) =>
      api<DealApplicationListResponse>('GET', withCursor(`/deals/${id}/applications`, pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

/** The pay panel's data, with the creator's full UPI ID. Loaded only on the pay step. */
export function useDirectPayment(id: string, enabled: boolean) {
  return useQuery({
    queryKey: dealKeys.directPayment(id),
    queryFn: () => api<DirectPaymentInfo>('GET', `/deals/${id}/direct-payment`),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useFeed() {
  return useInfiniteQuery({
    queryKey: dealKeys.feed,
    queryFn: ({ pageParam }) => api<DealFeedResponse>('GET', withCursor('/deals/feed', pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** `statuses` is a comma list for ?status=, or '' for every status. */
export function useMyDeals(statuses: string) {
  return useInfiniteQuery({
    queryKey: dealKeys.mine(statuses),
    queryFn: ({ pageParam }) =>
      api<DealMineResponse>(
        'GET',
        withCursor(statuses ? `/deals/mine?status=${statuses}` : '/deals/mine', pageParam),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useMyApplications() {
  return useInfiniteQuery({
    queryKey: dealKeys.myApplications,
    queryFn: ({ pageParam }) =>
      api<MyApplicationListResponse>('GET', withCursor('/applications/mine', pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

// ---- Mutations ----

/** Puts a deal the API returned into the cache, and marks the lists and history stale. */
export function storeDeal(client: QueryClient, deal: DealDetail) {
  client.setQueryData(dealKeys.deal(deal.id), deal);
  void client.invalidateQueries({ queryKey: dealKeys.events(deal.id) });
  void client.invalidateQueries({ queryKey: dealKeys.emails(deal.id) });
  void client.invalidateQueries({ queryKey: dealKeys.mineAll });
}

/** Re-reads everything about one deal. */
export function refreshDeal(client: QueryClient, id: string) {
  void client.invalidateQueries({ queryKey: dealKeys.deal(id) });
  void client.invalidateQueries({ queryKey: dealKeys.mineAll });
}

function useDealMutation<TInput>(
  dealId: string,
  fn: (input: TInput) => Promise<{ deal: DealDetail }>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => storeDeal(client, data.deal),
  });
}

export function useCreateDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: DraftInput) => api<DealDetailResponse>('POST', '/deals', input),
    onSuccess: (data) => storeDeal(client, data.deal),
  });
}

export function useUpdateDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DraftInput }) =>
      api<DealDetailResponse>('PATCH', `/deals/${id}`, input),
    onSuccess: (data) => storeDeal(client, data.deal),
  });
}

export function useDeleteDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>('DELETE', `/deals/${id}`),
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: dealKeys.deal(id) });
      void client.invalidateQueries({ queryKey: dealKeys.mineAll });
    },
  });
}

export function usePublish() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<DealDetailResponse>('POST', `/deals/${id}/publish`, {}),
    onSuccess: (data) => storeDeal(client, data.deal),
  });
}

export function useApply(dealId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ application: { id: string } }>('POST', `/deals/${dealId}/applications`, {}),
    onSuccess: () => {
      refreshDeal(client, dealId);
      void client.invalidateQueries({ queryKey: dealKeys.feed });
      void client.invalidateQueries({ queryKey: dealKeys.myApplications });
    },
  });
}

export function useConfirmApplicant(dealId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      api<DealDetailResponse>('POST', `/applications/${applicationId}/confirm`, {}),
    onSuccess: (data) => {
      storeDeal(client, data.deal);
      void client.invalidateQueries({ queryKey: dealKeys.applications(dealId) });
    },
  });
}

export function useCancelDeal(dealId: string) {
  return useDealMutation(dealId, (reason: string) =>
    api<DealDetailResponse>('POST', `/deals/${dealId}/cancel`, { reason }),
  );
}

export function useCreateFeeOrder(dealId: string) {
  return useMutation({
    mutationFn: () =>
      api<PaymentOrderResponse>('POST', `/deals/${dealId}/payments/commission/order`, {}),
  });
}

export function useVerifyPayment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PaymentVerifyInput) =>
      api<PaymentVerifyResponse>('POST', '/payments/verify', input),
    onSuccess: (data) => storeDeal(client, data.deal),
  });
}

export function useRecordPayment(dealId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { stage: DirectPaymentStage; reference: string; note?: string }) =>
      api<{ directPayment: DirectPaymentView }>('POST', `/deals/${dealId}/direct-payment`, input),
    onSettled: () => {
      refreshDeal(client, dealId);
      void client.invalidateQueries({ queryKey: dealKeys.directPayment(dealId) });
    },
  });
}

export function useConfirmPayment(dealId: string) {
  return useDealMutation(dealId, (recordId: string) =>
    api<{ deal: DealDetail }>('POST', `/direct-payments/${recordId}/confirm`, {}),
  );
}

export function useNotReceived(dealId: string) {
  return useDealMutation(dealId, ({ recordId, reason }: { recordId: string; reason: string }) =>
    api<{ deal: DealDetail }>('POST', `/direct-payments/${recordId}/not-received`, { reason }),
  );
}

export function useShareContent(dealId: string) {
  return useDealMutation(dealId, (link: string) =>
    api<DealDetailResponse>('POST', `/deals/${dealId}/content`, { link }),
  );
}

export function useSendFeedback(dealId: string) {
  return useDealMutation(dealId, (feedback: string) =>
    api<DealDetailResponse>('POST', `/deals/${dealId}/feedback`, { feedback }),
  );
}

export function useApprove(dealId: string) {
  return useDealMutation(dealId, () =>
    api<DealDetailResponse>('POST', `/deals/${dealId}/approve`, {}),
  );
}

export function useRaiseDispute(dealId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: DisputeInput) =>
      api<{ dispute: { id: string } }>('POST', `/deals/${dealId}/disputes`, input),
    onSuccess: () => refreshDeal(client, dealId),
  });
}
