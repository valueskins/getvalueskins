'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  DealDetail,
  DealEvent,
  DealParty,
  DealStatus,
  DealSummary,
  DirectPaymentView,
  DisputeStatus,
  PaymentStatus,
  PaymentType,
} from '@valueskins/shared';
import { api } from './client';

// The admin responses (SPEC 12) are not shared schemas yet (docs/WEB_API_GAPS.md, W3),
// so their shapes are written out here from the API.

export interface AdminDealItem extends DealSummary {
  creator: DealParty | null;
  hasOpenDispute: boolean;
  awaitingConfirmation: boolean;
  contentOverdue: boolean;
  updatedAt: string;
}

export interface AdminDealList {
  items: AdminDealItem[];
  nextCursor: string | null;
  /** Every deal that matches the filters, not only this page. */
  total: number;
}

export interface AdminPayment {
  id: string;
  type: PaymentType;
  status: PaymentStatus;
  amountPaise: number;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  failureReason: string | null;
  capturedAt: string | null;
  razorpayFeePaise: number | null;
  razorpayTaxPaise: number | null;
  invoiceNumber: string | null;
  createdAt: string;
}

export interface AdminEmail {
  id: string;
  template: string;
  subject: string;
  bodyText: string;
  toEmail: string;
  cc: string[];
  status: 'QUEUED' | 'SENT' | 'FAILED';
  error: string | null;
  attachmentNames: string[];
  createdAt: string;
  sentAt: string | null;
}

export interface AdminDispute {
  id: string;
  dealId: string;
  dealShortId: string;
  dealTitle: string | null;
  subject: string;
  description: string;
  status: DisputeStatus;
  raisedBy: { id: string; username: string; role: 'BRAND' | 'CREATOR' };
  resolution: string | null;
  refundReference: string | null;
  resolvedBy: { id: string | null; username: string } | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AdminDealDetail {
  deal: DealDetail;
  events: DealEvent[];
  payments: AdminPayment[];
  directPayments: DirectPaymentView[];
  emails: AdminEmail[];
  disputes: AdminDispute[];
}

export interface AdminDisputeList {
  items: AdminDispute[];
  nextCursor: string | null;
}

export interface ResendResult {
  emailLogId: string;
  status: string;
  missingAttachments: string[];
}

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
    queryFn: async () =>
      (await api<{ dispute: AdminDispute }>('GET', `/admin/disputes/${id}`)).dispute,
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
      api<{ dispute: AdminDispute }>('POST', `/admin/disputes/${disputeId}/resolve`, input),
    onSettled: () => refreshAdmin(client),
  });
}
