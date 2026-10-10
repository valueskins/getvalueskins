import type { DealStatus } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import { dealEvents, deals, emailLog, payments, transfers } from '../../src/db/schema/index.js';
import { brandWithBilling, creatorWithPayout, http, insertDeal } from '../helpers/deals.js';
import { addPayment, type MockTransfer, type OrdersMockState } from './razorpayOrdersMock.js';

type Api = ReturnType<typeof http>;
export type PaymentKind = 'commission' | 'advance' | 'final';

export const DUE_STATUS: Record<PaymentKind, DealStatus> = {
  commission: 'CONFIRMED',
  advance: 'COMMISSION_PAID',
  final: 'APPROVED',
};

export const NEXT_STATUS: Record<PaymentKind, DealStatus> = {
  commission: 'COMMISSION_PAID',
  advance: 'ADVANCE_PAID',
  final: 'COMPLETED',
};

/** The Razorpay linked account the mock puts on a Route transfer. Matching ignores it now. */
export const FIXTURE_ACCOUNT_ID = 'acc_fixture';

let orderCounter = 0;

/**
 * An advance or final order as one made before the rail changed: the API no longer creates
 * them (REPLACEMENT_PLAN 2.1), but verify and the webhooks still capture one that exists.
 */
export async function insertOrder(
  deal: { id: string; advancePaise: number | null; finalPaise: number | null },
  kind: 'advance' | 'final',
) {
  orderCounter += 1;
  const amountPaise = kind === 'advance' ? deal.advancePaise : deal.finalPaise;
  const [row] = await db
    .insert(payments)
    .values({
      dealId: deal.id,
      type: kind === 'advance' ? 'ADVANCE' : 'FINAL',
      amountPaise: amountPaise!,
      razorpayOrderId: `order_fixture${orderCounter}`,
    })
    .returning();
  return { orderId: row!.razorpayOrderId, amount: row!.amountPaise };
}

/**
 * A deal in the status where `kind` is due, with an order. The commission order is created
 * through the API; an advance or final order is inserted (see insertOrder).
 */
export async function dealWithOrder(call: Api, kind: PaymentKind) {
  const brand = await brandWithBilling();
  const creator = await creatorWithPayout('ACTIVE');
  const deal = await insertDeal(brand.user.id, DUE_STATUS[kind], { creatorId: creator.user.id });
  if (kind !== 'commission') {
    const order = await insertOrder(deal, kind);
    return { brand, creator, deal, accountId: FIXTURE_ACCOUNT_ID, ...order };
  }
  const res = await call.send(
    'post',
    `/api/deals/${deal.id}/payments/${kind}/order`,
    brand.cookie,
    {},
  );
  if (res.status !== 200)
    throw new Error(`order failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    brand,
    creator,
    deal,
    accountId: FIXTURE_ACCOUNT_ID,
    orderId: res.body.orderId as string,
    amount: res.body.amountPaise as number,
  };
}

/** Razorpay's view after the customer paid: the captured payment and, for Route, its transfer. */
export function razorpayCaptured(
  state: OrdersMockState,
  f: { orderId: string; amount: number; accountId: string },
  kind: PaymentKind,
  options: { paymentId?: string; transfer?: Partial<MockTransfer> | null } = {},
) {
  const paymentId = options.paymentId ?? 'pay_mock1';
  addPayment(state, {
    id: paymentId,
    order_id: f.orderId,
    status: 'captured',
    amount: f.amount,
    currency: 'INR',
    email: 'payer@example.com',
    contact: '+919876543210',
    vpa: 'payer@okbank',
  });
  if (kind !== 'commission' && options.transfer !== null) {
    state.transfers.set(paymentId, [
      {
        id: 'trf_mock1',
        source: paymentId,
        recipient: f.accountId,
        amount: f.amount,
        currency: 'INR',
        status: 'processed',
        fees: 590,
        tax: 106,
        processed_at: 1_790_000_000,
        ...options.transfer,
      },
    ]);
  }
  return paymentId;
}

export async function dealState(dealId: string) {
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  const events = await db.select().from(dealEvents).where(eq(dealEvents.dealId, dealId));
  const rows = await db.select().from(transfers).where(eq(transfers.dealId, dealId));
  return { deal: deal!, events, transfers: rows };
}

export async function emails(template: string) {
  return (await db.select().from(emailLog)).filter((row) => row.template === template);
}
