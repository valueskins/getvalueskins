import { http, HttpResponse } from 'msw';

const BASE = 'https://api.razorpay.com';

export interface MockPayment {
  id: string;
  order_id: string | null;
  status: string;
  amount: number;
  currency: string;
  // Personal details Razorpay really sends; the app must keep them out of storage and logs.
  email?: string;
  contact?: string;
  vpa?: string;
  /** Razorpay's fee and tax on the payment, in paise. */
  fee?: number;
  tax?: number;
}

export interface OrdersMockState {
  orderCalls: Array<Record<string, unknown>>;
  orders: Map<string, { id: string; amount: number }>;
  payments: Map<string, MockPayment>;
  fetchPaymentCalls: string[];
  /** Make the next `times` POST /v1/orders answer with this status. */
  orderFailure: { status: number; times: number } | null;
  /** Make the next `times` POST /v1/orders fail at the network level (no response). */
  orderNetworkError: { times: number } | null;
  /** Every POST /v1/orders attempt, including the ones that failed. */
  orderAttempts: number;
}

export function newOrdersState(): OrdersMockState {
  return {
    orderCalls: [],
    orders: new Map(),
    payments: new Map(),
    fetchPaymentCalls: [],
    orderFailure: null,
    orderNetworkError: null,
    orderAttempts: 0,
  };
}

export function ordersHandlers(state: OrdersMockState) {
  let counter = 0;
  return [
    http.post(`${BASE}/v1/orders`, async ({ request }) => {
      state.orderAttempts += 1;
      if (state.orderNetworkError && state.orderNetworkError.times > 0) {
        state.orderNetworkError.times -= 1;
        return HttpResponse.error();
      }
      if (state.orderFailure && state.orderFailure.times > 0) {
        state.orderFailure.times -= 1;
        return HttpResponse.json(
          { error: { code: 'SERVER_ERROR' } },
          { status: state.orderFailure.status },
        );
      }
      const body = (await request.json()) as {
        amount: number;
        currency: string;
      };
      state.orderCalls.push(body as Record<string, unknown>);
      counter += 1;
      const id = `order_mock${counter}`;
      state.orders.set(id, { id, amount: body.amount });
      return HttpResponse.json({
        id,
        entity: 'order',
        amount: body.amount,
        currency: body.currency,
        status: 'created',
      });
    }),

    http.get(`${BASE}/v1/payments/:id`, ({ params }) => {
      const id = String(params.id);
      state.fetchPaymentCalls.push(id);
      const payment = state.payments.get(id);
      if (!payment) {
        return HttpResponse.json(
          { error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' } },
          { status: 400 },
        );
      }
      return HttpResponse.json({ entity: 'payment', ...payment });
    }),
  ];
}

/** Registers a payment as Razorpay would hold it after the customer paid. */
export function addPayment(state: OrdersMockState, payment: MockPayment): void {
  state.payments.set(payment.id, payment);
}
