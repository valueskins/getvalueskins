import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { deals } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, READY_DRAFT, brandWithBilling, http, insertDeal } from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv();
const api = http(createApp(env, { now: () => NOW }));

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

describe('POST /api/deals', () => {
  it('saves an empty draft', async () => {
    const { cookie, user } = await brandWithBilling();
    const res = await api.send('post', '/api/deals', cookie, {});
    expect(res.status).toBe(201);
    expect(res.body.deal).toMatchObject({
      status: 'DRAFT',
      title: null,
      description: null,
      budgetPaise: null,
      applicationDeadline: null,
      commissionTotalPaise: null,
      brand: { id: user.id },
    });
    expect(res.body.deal.shortId).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
  });

  it('stores the budget in paise and keeps the breakdown empty until publish', async () => {
    const { cookie } = await brandWithBilling();
    const res = await api.send('post', '/api/deals', cookie, READY_DRAFT);
    expect(res.status).toBe(201);
    expect(res.body.deal).toMatchObject({
      budgetPaise: 10_000_00,
      commissionTotalPaise: null,
      creatorAmountPaise: null,
      advancePaise: null,
      finalPaise: null,
      applicationDeadline: READY_DRAFT.applicationDeadline,
    });
  });

  it('rejects invalid input with VALIDATION_ERROR details', async () => {
    const { cookie } = await brandWithBilling();
    const res = await api.send('post', '/api/deals', cookie, { budgetRupees: 10.5, extra: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('gives every draft a different short id', async () => {
    const { cookie } = await brandWithBilling();
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      ids.add((await api.send('post', '/api/deals', cookie, {})).body.deal.shortId);
    }
    expect(ids.size).toBe(5);
  });
});

describe('PATCH /api/deals/:id', () => {
  it('updates only the fields sent and clears a field with null', async () => {
    const { cookie } = await brandWithBilling();
    const created = (await api.send('post', '/api/deals', cookie, READY_DRAFT)).body.deal;

    const res = await api.send('patch', `/api/deals/${created.id}`, cookie, {
      title: '  New title ',
      description: null,
      budgetRupees: 7_500,
    });
    expect(res.status).toBe(200);
    expect(res.body.deal).toMatchObject({
      title: 'New title',
      description: null,
      budgetPaise: 7_500_00,
      applicationDeadline: READY_DRAFT.applicationDeadline,
    });
  });

  it('accepts an empty patch', async () => {
    const { cookie } = await brandWithBilling();
    const created = (await api.send('post', '/api/deals', cookie, READY_DRAFT)).body.deal;
    const res = await api.send('patch', `/api/deals/${created.id}`, cookie, {});
    expect(res.status).toBe(200);
    expect(res.body.deal.title).toBe(READY_DRAFT.title);
  });

  it('refuses to edit a published deal', async () => {
    const { cookie, user } = await brandWithBilling();
    const open = await insertDeal(user.id, 'OPEN');
    const res = await api.send('patch', `/api/deals/${open.id}`, cookie, { title: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEAL_NOT_DRAFT');
    const [row] = await db.select().from(deals).where(eq(deals.id, open.id));
    expect(row?.title).toBe(open.title);
  });

  it("is a 404 for another brand's draft and for ids that cannot exist", async () => {
    const owner = await brandWithBilling();
    const other = await brandWithBilling();
    const draft = await insertDeal(owner.user.id, 'DRAFT');
    expect((await api.send('patch', `/api/deals/${draft.id}`, other.cookie, {})).status).toBe(404);
    expect((await api.send('patch', '/api/deals/not-a-uuid', owner.cookie, {})).status).toBe(404);
  });
});

describe('DELETE /api/deals/:id', () => {
  it('deletes a draft', async () => {
    const { cookie, user } = await brandWithBilling();
    const draft = await insertDeal(user.id, 'DRAFT');
    const res = await api.send('delete', `/api/deals/${draft.id}`, cookie);
    expect(res.status).toBe(200);
    expect(await db.select().from(deals).where(eq(deals.id, draft.id))).toHaveLength(0);
  });

  it('refuses a published deal and leaves it in place', async () => {
    const { cookie, user } = await brandWithBilling();
    const open = await insertDeal(user.id, 'OPEN');
    const res = await api.send('delete', `/api/deals/${open.id}`, cookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEAL_NOT_DRAFT');
    expect(await db.select().from(deals).where(eq(deals.id, open.id))).toHaveLength(1);
  });

  it("is a 404 for another brand's draft", async () => {
    const owner = await brandWithBilling();
    const other = await brandWithBilling();
    const draft = await insertDeal(owner.user.id, 'DRAFT');
    expect((await api.send('delete', `/api/deals/${draft.id}`, other.cookie)).status).toBe(404);
    expect(await db.select().from(deals).where(eq(deals.id, draft.id))).toHaveLength(1);
  });
});
