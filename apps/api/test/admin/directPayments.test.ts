import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http as api,
  insertDeal,
} from '../helpers/deals.js';
import { confirmPayment, notReceived, recordPayment } from '../payments/fixture.js';
import { buildTestEnv } from '../testEnv.js';
import { adminUser } from './helpers.js';

const env = buildTestEnv();
const call = api(createApp(env, { now: () => NOW }));
const server = setupServer();

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
beforeEach(truncateAll);
afterAll(async () => {
  server.close();
  await closeDb();
});

describe('the admin deal detail shows the direct payments', () => {
  it('lists every record, disputed ones too, with the UPI ID masked', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'COMMISSION_PAID', { creatorId: creator.user.id });
    const first = await recordPayment(call, brand, deal.id, 'ADVANCE', 'FIRSTUTR001');
    await notReceived(call, creator, first.body.directPayment.id);
    const second = await recordPayment(call, brand, deal.id, 'ADVANCE', 'SECONDUTR01');
    await confirmPayment(call, creator, second.body.directPayment.id);

    const res = await call.get(`/api/admin/deals/${deal.id}`, admin.cookie);
    expect(res.status).toBe(200);
    expect(
      res.body.directPayments.map((p: { reference: string; status: string }) => [
        p.reference,
        p.status,
      ]),
    ).toEqual([
      ['FIRSTUTR001', 'DISPUTED'],
      ['SECONDUTR01', 'CONFIRMED'],
    ]);
    expect(res.body).not.toHaveProperty('transfers');
    expect(JSON.stringify(res.body)).not.toContain('test.creator');
  });

  it('the transfer retry and mark-manual routes are gone', async () => {
    const admin = await adminUser();
    const id = '0197c0a0-0000-7000-8000-000000000000';
    expect(
      (await call.send('post', `/api/admin/transfers/${id}/retry`, admin.cookie, {})).status,
    ).toBe(404);
    expect(
      (
        await call.send('post', `/api/admin/transfers/${id}/mark-manual`, admin.cookie, {
          reference: 'UTR1',
        })
      ).status,
    ).toBe(404);
  });
});
