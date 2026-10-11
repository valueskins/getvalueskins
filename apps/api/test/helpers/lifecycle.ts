import type { http } from './deals.js';
import { verifyBody } from './payments.js';
import { dealWithOrder, razorpayCaptured, recordAndConfirm } from '../payments/fixture.js';
import type { OrdersMockState } from '../payments/razorpayOrdersMock.js';

type Api = ReturnType<typeof http>;

export const DRIVE_LINK = 'https://drive.google.com/file/d/lifecycle/view';

let counter = 0;

/**
 * Takes a brand and creator through a deal with the real endpoints: the commission through the
 * Razorpay mock, then the advance (recorded by the brand, confirmed by the creator), upload,
 * approve and the final the same way. Stops after `upTo`.
 */
export async function runDeal(
  call: Api,
  razorpay: OrdersMockState,
  upTo: 'COMMISSION_PAID' | 'ADVANCE_PAID' | 'CONTENT_UPLOADED' | 'APPROVED' | 'COMPLETED',
) {
  const first = await dealWithOrder(call, 'commission');
  const { brand, creator, deal } = first;

  counter += 1;
  const paymentId = razorpayCaptured(razorpay, first, 'commission', {
    paymentId: `pay_l${counter}`,
  });
  const verified = await call.send(
    'post',
    '/api/payments/verify',
    brand.cookie,
    verifyBody(first.orderId, paymentId),
  );
  if (verified.status !== 200) {
    throw new Error(`verify failed: ${verified.status} ${JSON.stringify(verified.body)}`);
  }

  const paymentIds: Record<string, string> = { commission: paymentId };
  if (upTo !== 'COMMISSION_PAID') {
    paymentIds.advance = await recordAndConfirm(call, first, 'ADVANCE');
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
    paymentIds.final = await recordAndConfirm(call, first, 'FINAL');
  }
  return { brand, creator, deal, paymentIds };
}
