import type { z } from 'zod';
import type { Env } from '../env/index.js';
import { RazorpayApiError } from './errors.js';
import {
  linkedAccountSchema,
  razorpayErrorBodySchema,
  razorpayOrderSchema,
  razorpayPaymentSchema,
  razorpayTransferListSchema,
  routeProductSchema,
  stakeholderSchema,
} from './schemas.js';

const BASE_URL = 'https://api.razorpay.com';

/** SPEC 13: retry up to 3 times, with exponential backoff, for network errors and 5xx only. */
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 250;

export interface RazorpayClientOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface CreateLinkedAccountBody {
  email: string;
  phone: string;
  legal_business_name: string;
  business_type: 'individual';
  contact_name: string;
  profile: {
    category: string;
    subcategory: string;
    addresses: { registered: { country: string } };
  };
  notes: Record<string, string>;
}

export interface CreateStakeholderBody {
  name: string;
  email: string;
  phone: { primary: string };
  kyc: { pan: string };
}

export interface SettlementsBody {
  settlements: { account_number: string; ifsc_code: string; beneficiary_name: string };
  tnc_accepted: true;
}

/** POST /v1/payments/:id/transfers: one transfer from an already captured payment (admin retry, SPEC 7.3). */
export interface CreatePaymentTransferBody {
  transfers: Array<{
    account: string;
    amount: number;
    currency: 'INR';
    notes: Record<string, string>;
    on_hold: boolean;
  }>;
}

export interface CreateOrderBody {
  amount: number;
  currency: 'INR';
  receipt: string;
  notes: Record<string, string>;
  /** Advance and final: the full amount to the creator's linked account (SPEC 7.3). */
  transfers?: Array<{
    account: string;
    amount: number;
    currency: 'INR';
    notes: Record<string, string>;
    on_hold: boolean;
  }>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Minimal Razorpay Route client (plain fetch, no SDK). Request and response
 * bodies are never logged. Responses are parsed through schemas that keep only
 * the fields we use.
 */
export function createRazorpayClient(
  env: Pick<Env, 'RAZORPAY_KEY_ID' | 'RAZORPAY_KEY_SECRET'>,
  options: RazorpayClientOptions = {},
) {
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? BASE_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const authorization = `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`;

  async function request<S extends z.ZodTypeAny>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<z.infer<S>> {
    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < maxRetries;
      let response: Response;
      try {
        response = await fetch(`${BASE_URL}${path}`, {
          method,
          headers: {
            Authorization: authorization,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        if (canRetry) {
          await sleep(baseDelayMs * 2 ** attempt);
          continue;
        }
        throw new RazorpayApiError({ status: null, code: null, field: null, description: null });
      }

      if (response.status >= 500) {
        if (canRetry) {
          await sleep(baseDelayMs * 2 ** attempt);
          continue;
        }
        throw new RazorpayApiError({
          status: response.status,
          code: null,
          field: null,
          description: null,
        });
      }

      const json: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const parsed = razorpayErrorBodySchema.safeParse(json);
        const error = parsed.success ? parsed.data.error : undefined;
        throw new RazorpayApiError({
          status: response.status,
          code: error?.code ?? null,
          field: error?.field ?? null,
          description: error?.description ?? null,
        });
      }

      const result = schema.safeParse(json);
      if (!result.success) {
        throw new RazorpayApiError({
          status: response.status,
          code: 'UNEXPECTED_RESPONSE',
          field: null,
          description: null,
        });
      }
      return result.data;
    }
  }

  return {
    createLinkedAccount: (body: CreateLinkedAccountBody) =>
      request('POST', '/v2/accounts', linkedAccountSchema, { ...body, type: 'route' }),

    fetchLinkedAccount: (accountId: string) =>
      request('GET', `/v2/accounts/${accountId}`, linkedAccountSchema),

    createStakeholder: (accountId: string, body: CreateStakeholderBody) =>
      request('POST', `/v2/accounts/${accountId}/stakeholders`, stakeholderSchema, body),

    requestRouteProduct: (accountId: string) =>
      request('POST', `/v2/accounts/${accountId}/products`, routeProductSchema, {
        product_name: 'route',
        tnc_accepted: true,
      }),

    updateRouteProductSettlements: (accountId: string, productId: string, body: SettlementsBody) =>
      request('PATCH', `/v2/accounts/${accountId}/products/${productId}`, routeProductSchema, body),

    fetchRouteProduct: (accountId: string, productId: string) =>
      request('GET', `/v2/accounts/${accountId}/products/${productId}`, routeProductSchema),

    createOrder: (body: CreateOrderBody) =>
      request('POST', '/v1/orders', razorpayOrderSchema, body),

    fetchPayment: (paymentId: string) =>
      request('GET', `/v1/payments/${paymentId}`, razorpayPaymentSchema),

    createPaymentTransfers: (paymentId: string, body: CreatePaymentTransferBody) =>
      request('POST', `/v1/payments/${paymentId}/transfers`, razorpayTransferListSchema, body),

    fetchPaymentTransfers: (paymentId: string) =>
      request('GET', `/v1/payments/${paymentId}/transfers`, razorpayTransferListSchema),
  };
}

export type RazorpayClient = ReturnType<typeof createRazorpayClient>;
