import type { http } from './deals.js';
import { verifyBody } from './payments.js';
import { dealWithOrder, razorpayCaptured, type PaymentKind } from '../payments/fixture.js';
import type { OrdersMockState } from '../payments/razorpayOrdersMock.js';

type Api = ReturnType<typeof http>;

export const DRIVE_LINK = 'https://drive.google.com/file/d/lifecycle/view';

let counter = 0;

/**
 * Takes a brand and creator through a deal with the real endpoints: commission, advance,
 * upload, approve, final. Stops after `upTo`. Razorpay is the msw mock.
 */
export async function runDeal(
  call: Api,
  razorpay: OrdersMockState,
  upTo: 'COMMISSION_PAID' | 'ADVANCE_PAID' | 'CONTENT_UPLOADED' | 'APPROVED' | 'COMPLETED',
) {
  const first = await dealWithOrder(call, 'commission');
  const { brand, creator, deal, accountId } = first;

  async function pay(kind: PaymentKind, order: { orderId: string; amount: number }) {
    counter += 1;
    const paymentId = razorpayCaptured(
      razorpay,
      { orderId: order.orderId, amount: order.amount, accountId },
      kind,
      { paymentId: `pay_l${counter}`, transfer: { id: `trf_l${counter}` } },
    );
    const res = await call.send(
      'post',
      '/api/payments/verify',
      brand.cookie,
      verifyBody(order.orderId, paymentId),
    );
    if (res.status !== 200)
      throw new Error(`verify failed: ${res.status} ${JSON.stringify(res.body)}`);
    return paymentId;
  }
  const orderFor = async (kind: PaymentKind) => {
    const res = await call.send(
      'post',
      `/api/deals/${deal.id}/payments/${kind}/order`,
      brand.cookie,
      {},
    );
    if (res.status !== 200)
      throw new Error(`order failed: ${res.status} ${JSON.stringify(res.body)}`);
    return { orderId: res.body.orderId as string, amount: res.body.amountPaise as number };
  };

  const paymentIds: Record<string, string> = {};
  paymentIds.commission = await pay('commission', first);
  if (upTo !== 'COMMISSION_PAID') {
    paymentIds.advance = await pay('advance', await orderFor('advance'));
  }
  if (upTo === 'CONTENT_UPLOADED' || upTo === 'APPROVED' || upTo === 'COMPLETED') {
    const res = await call.send('post', `/api/deals/${deal.id}/content`, creator.cookie, {
      link: DRIVE_LINK,
    });
    if (res.status !== 200) throw new Error(`upload failed: ${res.status}`);
  }
  if (upTo === 'APPROVED' || upTo === 'COMPLETED') {
    const res = await call.send('post', `/api/deals/${deal.id}/approve`, brand.cookie, {});
    if (res.status !== 200) throw new Error(`approve failed: ${res.status}`);
  }
  if (upTo === 'COMPLETED') {
    paymentIds.final = await pay('final', await orderFor('final'));
  }
  return { brand, creator, deal, accountId, paymentIds };
}
