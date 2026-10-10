import { http, HttpResponse } from 'msw';

const BASE = 'https://api.razorpay.com';

export interface MockTransfer {
  id: string;
  source: string;
  recipient: string;
  amount: number;
  currency: string;
  status: string;
  fees?: number;
  tax?: number;
  error?: { code?: string; description?: string; reason?: string } | null;
  processed_at?: number | null;
}

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
  transfers: Map<string, MockTransfer[]>;
  fetchPaymentCalls: string[];
  fetchTransfersCalls: string[];
  /** Make the next `times` POST /v1/orders answer with this status. */
  orderFailure: { status: number; times: number } | null;
  /** Make GET /v1/payments/:id/transfers answer 500 (the capture must still be recorded). */
  transfersListDown: boolean;
  /** POST /v1/payments/:id/transfers calls (the admin retry), with the payment id and the body. */
  createTransferCalls: Array<{ paymentId: string; body: Record<string, unknown> }>;
  /** Make POST /v1/payments/:id/transfers answer with this 4xx and description. */
  createTransferRejection: { status: number; code: string; description: string } | null;
  /** The status a transfer created by POST /v1/payments/:id/transfers starts in. */
  createdTransferStatus: string;
}

export function newOrdersState(): OrdersMockState {
  return {
    orderCalls: [],
    orders: new Map(),
    payments: new Map(),
    transfers: new Map(),
    fetchPaymentCalls: [],
    fetchTransfersCalls: [],
    orderFailure: null,
    transfersListDown: false,
    createTransferCalls: [],
    createTransferRejection: null,
    createdTransferStatus: 'created',
  };
}

export function ordersHandlers(state: OrdersMockState) {
  let counter = 0;
  return [
    http.post(`${BASE}/v1/orders`, async ({ request }) => {
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
        transfers?: Array<Record<string, unknown>>;
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
        transfers: (body.transfers ?? []).map((t, i) => ({
          id: `trf_mock${counter}_${i}`,
          recipient: t.account,
          amount: t.amount,
          currency: t.currency,
          status: 'created',
        })),
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

    http.get(`${BASE}/v1/payments/:id/transfers`, ({ params }) => {
      const id = String(params.id);
      state.fetchTransfersCalls.push(id);
      if (state.transfersListDown) {
        return HttpResponse.json({ error: { code: 'SERVER_ERROR' } }, { status: 500 });
      }
      const items = state.transfers.get(id) ?? [];
      return HttpResponse.json({ entity: 'collection', count: items.length, items });
    }),

    http.post(`${BASE}/v1/payments/:id/transfers`, async ({ params, request }) => {
      const paymentId = String(params.id);
      const body = (await request.json()) as {
        transfers: Array<{ account: string; amount: number; currency: string }>;
      };
      state.createTransferCalls.push({ paymentId, body: body as Record<string, unknown> });
      if (state.createTransferRejection) {
        const { status, code, description } = state.createTransferRejection;
        return HttpResponse.json({ error: { code, description } }, { status });
      }
      const created: MockTransfer[] = body.transfers.map((t, i) => ({
        id: `trf_retry${state.createTransferCalls.length}_${i}`,
        source: paymentId,
        recipient: t.account,
        amount: t.amount,
        currency: t.currency,
        status: state.createdTransferStatus,
      }));
      state.transfers.set(paymentId, [...(state.transfers.get(paymentId) ?? []), ...created]);
      return HttpResponse.json({ entity: 'collection', count: created.length, items: created });
    }),
  ];
}

/** Registers a payment as Razorpay would hold it after the customer paid. */
export function addPayment(state: OrdersMockState, payment: MockPayment): void {
  state.payments.set(payment.id, payment);
}
