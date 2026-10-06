import { http, HttpResponse, delay } from 'msw';

const BASE = 'https://api.razorpay.com';

export type Step =
  'account' | 'fetchAccount' | 'stakeholder' | 'product' | 'settlements' | 'fetchProduct';

export interface RazorpayMockState {
  calls: Record<Step, number>;
  bodies: Partial<Record<Step, Record<string, unknown>>>;
  /** activation_status returned by the product endpoints. */
  activationStatus: string;
  requirements: Array<Record<string, unknown>>;
  /** Respond with this HTTP status for the next `times` calls to a step. */
  failures: Partial<
    Record<Step, { status: number | 'network'; times: number; description?: string }>
  >;
  /** Make the settlements call slow, so a second request can overlap it. */
  settlementsDelayMs: number;
  /** notes returned by GET /v2/accounts/:id */
  existingAccountNotes: unknown;
}

export function newRazorpayState(): RazorpayMockState {
  return {
    calls: {
      account: 0,
      fetchAccount: 0,
      stakeholder: 0,
      product: 0,
      settlements: 0,
      fetchProduct: 0,
    },
    bodies: {},
    activationStatus: 'under_review',
    requirements: [],
    failures: {},
    settlementsDelayMs: 0,
    existingAccountNotes: {},
  };
}

// What a real Razorpay response contains: it echoes the full bank account
// number and PAN. The client must keep none of it.
export const ECHOED_ACCOUNT_NUMBER = '99887766554433';
export const ECHOED_PAN = 'ZZZPZ9999Z';

function failure(state: RazorpayMockState, step: Step): Response | null {
  const planned = state.failures[step];
  if (!planned || planned.times <= 0) return null;
  planned.times -= 1;
  if (planned.status === 'network') return HttpResponse.error();
  return HttpResponse.json(
    {
      error: {
        code: planned.status >= 500 ? 'SERVER_ERROR' : 'BAD_REQUEST_ERROR',
        description: planned.description ?? 'The request was not accepted',
        field: planned.status >= 500 ? null : 'phone',
      },
    },
    { status: planned.status },
  );
}

function productBody(state: RazorpayMockState, status: string) {
  return {
    id: 'acc_prd_test1',
    account_id: 'acc_test1',
    product_name: 'route',
    activation_status: status,
    requirements: state.requirements,
    active_configuration: {
      settlements: {
        account_number: ECHOED_ACCOUNT_NUMBER,
        ifsc_code: 'HDFC0001234',
        beneficiary_name: 'Jane Doe',
      },
    },
  };
}

export function razorpayHandlers(state: RazorpayMockState) {
  return [
    http.post(`${BASE}/v2/accounts`, async ({ request }) => {
      state.calls.account += 1;
      state.bodies.account = (await request.json()) as Record<string, unknown>;
      return (
        failure(state, 'account') ??
        HttpResponse.json({
          id: 'acc_test1',
          email: 'echo',
          legal_info: { pan: ECHOED_PAN },
          notes: {},
        })
      );
    }),
    http.get(`${BASE}/v2/accounts/:id`, ({ params }) => {
      state.calls.fetchAccount += 1;
      return (
        failure(state, 'fetchAccount') ??
        HttpResponse.json({
          id: params.id,
          notes: state.existingAccountNotes,
          legal_info: { pan: ECHOED_PAN },
        })
      );
    }),
    http.post(`${BASE}/v2/accounts/:id/stakeholders`, async ({ request }) => {
      state.calls.stakeholder += 1;
      state.bodies.stakeholder = (await request.json()) as Record<string, unknown>;
      return (
        failure(state, 'stakeholder') ??
        HttpResponse.json({ id: 'sth_test1', kyc: { pan: ECHOED_PAN } })
      );
    }),
    http.post(`${BASE}/v2/accounts/:id/products`, async ({ request }) => {
      state.calls.product += 1;
      state.bodies.product = (await request.json()) as Record<string, unknown>;
      return failure(state, 'product') ?? HttpResponse.json(productBody(state, 'requested'));
    }),
    http.patch(`${BASE}/v2/accounts/:id/products/:productId`, async ({ request }) => {
      state.calls.settlements += 1;
      state.bodies.settlements = (await request.json()) as Record<string, unknown>;
      if (state.settlementsDelayMs > 0) await delay(state.settlementsDelayMs);
      return (
        failure(state, 'settlements') ??
        HttpResponse.json(productBody(state, state.activationStatus))
      );
    }),
    http.get(`${BASE}/v2/accounts/:id/products/:productId`, () => {
      state.calls.fetchProduct += 1;
      return (
        failure(state, 'fetchProduct') ??
        HttpResponse.json(productBody(state, state.activationStatus))
      );
    }),
  ];
}
