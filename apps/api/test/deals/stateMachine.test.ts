import { DEAL_TRANSITIONS } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { dealEvents, deals } from '../../src/db/schema/index.js';
import { transitionDeal } from '../../src/deals/stateMachine.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { breakdownColumns, brandWithBilling, insertDeal } from '../helpers/deals.js';

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

async function status(dealId: string) {
  const [row] = await db.select({ status: deals.status }).from(deals).where(eq(deals.id, dealId));
  return row?.status;
}

describe('transitionDeal: every allowed transition', () => {
  it.each(DEAL_TRANSITIONS.map((t) => [t.from, t.to, t.roles[0]!] as const))(
    '%s -> %s as %s changes the status and records the event',
    async (from, to, role) => {
      const { user } = await brandWithBilling();
      const deal = await insertDeal(user.id, from);

      const updated = await transitionDeal({
        dealId: deal.id,
        from,
        to,
        actor: { role, id: role === 'SYSTEM' ? null : user.id },
        note: 'because',
        // The CHECK constraint wants the breakdown on anything past DRAFT.
        patch: from === 'DRAFT' ? breakdownColumns() : undefined,
      });

      expect(updated.status).toBe(to);
      expect(await status(deal.id)).toBe(to);
      const events = await db.select().from(dealEvents).where(eq(dealEvents.dealId, deal.id));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        fromStatus: from,
        toStatus: to,
        note: 'because',
        actorType: role === 'SYSTEM' ? 'SYSTEM' : role === 'ADMIN' ? 'ADMIN' : 'USER',
      });
    },
  );
});

describe('transitionDeal: rejections', () => {
  it('rejects a pair that is not in the table, without touching the database', async () => {
    const { user } = await brandWithBilling();
    const deal = await insertDeal(user.id, 'OPEN');

    await expect(
      transitionDeal({
        dealId: deal.id,
        from: 'OPEN',
        to: 'COMPLETED',
        actor: { role: 'BRAND', id: user.id },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
    expect(await status(deal.id)).toBe('OPEN');
  });

  it('rejects an actor role the transition does not allow', async () => {
    const { user } = await brandWithBilling();
    const deal = await insertDeal(user.id, 'CONFIRMED');
    await expect(
      transitionDeal({
        dealId: deal.id,
        from: 'CONFIRMED',
        to: 'COMMISSION_PAID',
        actor: { role: 'BRAND', id: user.id },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('answers 409 when the deal is no longer in the expected status, and writes no event', async () => {
    const { user } = await brandWithBilling();
    const deal = await insertDeal(user.id, 'CANCELLED');
    await expect(
      transitionDeal({
        dealId: deal.id,
        from: 'OPEN',
        to: 'CANCELLED',
        actor: { role: 'BRAND', id: user.id },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
    expect(await db.select().from(dealEvents)).toHaveLength(0);
  });

  it('lets exactly one of two parallel transitions win', async () => {
    const { user } = await brandWithBilling();
    const deal = await insertDeal(user.id, 'OPEN');
    const attempt = () =>
      transitionDeal({
        dealId: deal.id,
        from: 'OPEN',
        to: 'CANCELLED',
        actor: { role: 'BRAND', id: user.id },
      });

    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await db.select().from(dealEvents)).toHaveLength(1);
  });
});

describe('transitionDeal: hooks', () => {
  it('prepare runs under the lock and its patch is applied with the status', async () => {
    const { user } = await brandWithBilling();
    const deal = await insertDeal(user.id, 'DRAFT');
    const updated = await transitionDeal({
      dealId: deal.id,
      from: 'DRAFT',
      to: 'OPEN',
      actor: { role: 'BRAND', id: user.id },
      prepare: async (_tx, current) => {
        expect(current.status).toBe('DRAFT');
        return { title: 'Prepared', ...breakdownColumns() };
      },
    });
    expect(updated).toMatchObject({ status: 'OPEN', title: 'Prepared' });
  });

  it('a throw in prepare or within rolls the whole transition back', async () => {
    const { user } = await brandWithBilling();
    const deal = await insertDeal(user.id, 'OPEN');
    await expect(
      transitionDeal({
        dealId: deal.id,
        from: 'OPEN',
        to: 'CANCELLED',
        actor: { role: 'BRAND', id: user.id },
        within: async () => {
          throw new Error('boom');
        },
      }),
    ).rejects.toThrow('boom');
    expect(await status(deal.id)).toBe('OPEN');
    expect(await db.select().from(dealEvents)).toHaveLength(0);

    await expect(
      transitionDeal({
        dealId: deal.id,
        from: 'OPEN',
        to: 'CANCELLED',
        actor: { role: 'BRAND', id: user.id },
        prepare: async () => {
          throw new Error('not ready');
        },
      }),
    ).rejects.toThrow('not ready');
    expect(await status(deal.id)).toBe('OPEN');
  });

  it('afterCommit tasks run once each, in order, and only after the commit is visible', async () => {
    const { user } = await brandWithBilling();
    const deal = await insertDeal(user.id, 'OPEN');
    const calls: string[] = [];

    await transitionDeal({
      dealId: deal.id,
      from: 'OPEN',
      to: 'CANCELLED',
      actor: { role: 'BRAND', id: user.id },
      afterCommit: [
        async (updated) => {
          // A separate connection sees the committed row.
          calls.push(`first:${updated.status}:${await status(deal.id)}`);
        },
        async () => {
          calls.push('second');
        },
      ],
    });

    expect(calls).toEqual(['first:CANCELLED:CANCELLED', 'second']);
  });

  it('a failing afterCommit task does not fail the transition or stop the next task', async () => {
    const { user } = await brandWithBilling();
    const deal = await insertDeal(user.id, 'OPEN');
    let ran = false;

    const updated = await transitionDeal({
      dealId: deal.id,
      from: 'OPEN',
      to: 'CANCELLED',
      actor: { role: 'BRAND', id: user.id },
      afterCommit: [
        async () => {
          throw new Error('email provider down');
        },
        async () => {
          ran = true;
        },
      ],
    });

    expect(updated.status).toBe('CANCELLED');
    expect(ran).toBe(true);
  });

  it('does not run afterCommit when the transition is rejected', async () => {
    const { user } = await brandWithBilling();
    const deal = await insertDeal(user.id, 'CANCELLED');
    let ran = false;
    await expect(
      transitionDeal({
        dealId: deal.id,
        from: 'OPEN',
        to: 'CANCELLED',
        actor: { role: 'BRAND', id: user.id },
        afterCommit: [
          async () => {
            ran = true;
          },
        ],
      }),
    ).rejects.toThrow();
    expect(ran).toBe(false);
  });
});
