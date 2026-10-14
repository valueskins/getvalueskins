import { ADMIN_CANCEL_WINDOW, DEAL_STATUSES, type DealStatus } from '@valueskins/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { adminUser } from '../admin/helpers.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, brandWithBilling, creatorWithPayout, http, insertDeal } from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';

const call = http(createApp(buildTestEnv(), { now: () => NOW }));

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

// Plain words like "open" are fine; only the upper-case status names and snake_case codes are raw.
const rawStatusIn = (message: string) =>
  DEAL_STATUSES.some((s) => message.includes(s)) || /\b[a-z]+_[a-z_]+\b/.test(message);

async function dealAt(status: DealStatus) {
  const brand = await brandWithBilling();
  const creator = await creatorWithPayout();
  const hasCreator = status !== 'DRAFT' && status !== 'OPEN';
  const deal = await insertDeal(brand.user.id, status, {
    creatorId: hasCreator ? creator.user.id : null,
  });
  return { brand, creator, deal };
}

type Res = { status: number; body: { error: { code: string; message: string } } };

describe('error messages never name a raw status', () => {
  it('records the pattern the check uses', () => {
    expect(rawStatusIn('The deal is COMMISSION_PAID')).toBe(true);
    expect(rawStatusIn('moved from OPEN')).toBe(true);
    expect(rawStatusIn('wrong_deal_status')).toBe(true);
    expect(rawStatusIn('This deal just changed. Reload it and try again.')).toBe(false);
    expect(rawStatusIn('The deal is open for applications')).toBe(false);
  });

  const cases: Array<{ name: string; code: string; run: () => Promise<Res> }> = [
    {
      name: 'recording a payment that is not due',
      code: 'WRONG_DEAL_STATUS',
      run: async () => {
        const { brand, deal } = await dealAt('CONFIRMED');
        return call.send('post', `/api/deals/${deal.id}/direct-payment`, brand.cookie, {
          stage: 'ADVANCE',
          reference: 'UTR123456789',
        });
      },
    },
    {
      name: 'uploading content before the advance',
      code: 'WRONG_DEAL_STATUS',
      run: async () => {
        const { creator, deal } = await dealAt('CONFIRMED');
        return call.send('post', `/api/deals/${deal.id}/content`, creator.cookie, {
          link: 'https://drive.google.com/file/d/abc/view',
        });
      },
    },
    {
      name: 'sending feedback on approved content',
      code: 'WRONG_DEAL_STATUS',
      run: async () => {
        const { brand, deal } = await dealAt('APPROVED');
        return call.send('post', `/api/deals/${deal.id}/feedback`, brand.cookie, {
          feedback: 'Please change the intro',
        });
      },
    },
    {
      name: 'approving before content is uploaded',
      code: 'WRONG_DEAL_STATUS',
      run: async () => {
        const { brand, deal } = await dealAt('COMMISSION_PAID');
        return call.send('post', `/api/deals/${deal.id}/approve`, brand.cookie, {});
      },
    },
    {
      name: 'paying the fee when it is not due',
      code: 'WRONG_DEAL_STATUS',
      run: async () => {
        const { brand, deal } = await dealAt('ADVANCE_PAID');
        return call.send(
          'post',
          `/api/deals/${deal.id}/payments/commission/order`,
          brand.cookie,
          {},
        );
      },
    },
    {
      name: 'a brand cancelling after the fee',
      code: 'CANCELLATION_NOT_POSSIBLE',
      run: async () => {
        const { brand, deal } = await dealAt('ADVANCE_PAID');
        return call.send('post', `/api/deals/${deal.id}/cancel`, brand.cookie, {
          reason: 'Changed plans',
        });
      },
    },
    {
      name: 'a brand cancelling a completed deal',
      code: 'INVALID_TRANSITION',
      run: async () => {
        const { brand, deal } = await dealAt('COMPLETED');
        return call.send('post', `/api/deals/${deal.id}/cancel`, brand.cookie, {
          reason: 'Changed plans',
        });
      },
    },
    ...(['OPEN', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const).map((status) => ({
      name: `an admin cancelling a deal that is ${status}`,
      code: 'INVALID_TRANSITION',
      run: async () => {
        const admin = await adminUser();
        const { deal } = await dealAt(status);
        return call.send('post', `/api/admin/deals/${deal.id}/cancel`, admin.cookie, {
          note: 'Creator stopped responding',
        });
      },
    })),
  ];

  it.each(cases)('$name', async ({ code, run }) => {
    const res = await run();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(code);
    const { message } = res.body.error;
    expect(message.length).toBeGreaterThan(10);
    expect(rawStatusIn(message), message).toBe(false);
    // Plain English: no em dash, and "ValueSkins fee" rather than "commission".
    expect(message).not.toMatch(/—|commission/i);
  });

  it('the admin cancel message explains the window in words', async () => {
    const admin = await adminUser();
    const { deal } = await dealAt('OPEN');
    const res = await call.send('post', `/api/admin/deals/${deal.id}/cancel`, admin.cookie, {
      note: 'Creator stopped responding',
    });
    expect(res.body.error.message).toBe(ADMIN_CANCEL_WINDOW);
  });
});
