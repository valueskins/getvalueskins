import type { DealStatus } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import { dealEvents, deals, directPayments, emailLog } from '../../src/db/schema/index.js';
import { brandWithBilling, creatorWithPayout, http, insertDeal } from '../helpers/deals.js';
import { addPayment, type OrdersMockState } from './razorpayOrdersMock.js';

type Api = ReturnType<typeof http>;
export type PaymentKind = 'commission';

export const DUE_STATUS: Record<PaymentKind, DealStatus> = { commission: 'CONFIRMED' };
export const NEXT_STATUS: Record<PaymentKind, DealStatus> = { commission: 'COMMISSION_PAID' };

/** A CONFIRMED deal with a commission order created through the API. */
export async function dealWithOrder(call: Api, kind: PaymentKind = 'commission') {
  const brand = await brandWithBilling();
  const creator = await creatorWithPayout('ACTIVE');
  const deal = await insertDeal(brand.user.id, DUE_STATUS[kind], { creatorId: creator.user.id });
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
    orderId: res.body.orderId as string,
    amount: res.body.amountPaise as number,
  };
}

/** Razorpay's view after the customer paid the commission: the captured payment. */
export function razorpayCaptured(
  state: OrdersMockState,
  f: { orderId: string; amount: number },
  _kind: PaymentKind = 'commission',
  options: { paymentId?: string } = {},
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
  return paymentId;
}

export async function dealState(dealId: string) {
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  const events = await db.select().from(dealEvents).where(eq(dealEvents.dealId, dealId));
  const records = await db.select().from(directPayments).where(eq(directPayments.dealId, dealId));
  return { deal: deal!, events, directPayments: records };
}

export async function emails(template: string) {
  return (await db.select().from(emailLog)).filter((row) => row.template === template);
}

type Session = { cookie: string; user: { id: string } };

/** The brand records a direct UPI payment through the API. */
export function recordPayment(
  call: Api,
  brand: Session,
  dealId: string,
  stage: 'ADVANCE' | 'FINAL',
  reference = `UTR${stage}12345`,
  extra: object = {},
) {
  return call.send('post', `/api/deals/${dealId}/direct-payment`, brand.cookie, {
    stage,
    reference,
    ...extra,
  });
}

export function confirmPayment(call: Api, creator: Session, id: string) {
  return call.send('post', `/api/direct-payments/${id}/confirm`, creator.cookie, {});
}

export function notReceived(call: Api, creator: Session, id: string, reason = 'Nothing arrived') {
  return call.send('post', `/api/direct-payments/${id}/not-received`, creator.cookie, { reason });
}

/** Record, then confirm, with the real endpoints; throws if either fails. Returns the record id. */
export async function recordAndConfirm(
  call: Api,
  f: { brand: Session; creator: Session; deal: { id: string } },
  stage: 'ADVANCE' | 'FINAL',
  reference?: string,
) {
  const recorded = await recordPayment(call, f.brand, f.deal.id, stage, reference);
  if (recorded.status !== 201) {
    throw new Error(`record failed: ${recorded.status} ${JSON.stringify(recorded.body)}`);
  }
  const id = recorded.body.directPayment.id as string;
  const confirmed = await confirmPayment(call, f.creator, id);
  if (confirmed.status !== 200) {
    throw new Error(`confirm failed: ${confirmed.status} ${JSON.stringify(confirmed.body)}`);
  }
  return id;
}
