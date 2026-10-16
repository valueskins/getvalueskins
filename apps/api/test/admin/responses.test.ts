import {
  ADMIN_CANCEL_WINDOW,
  ADMIN_DEAL_ALREADY_CANCELLED,
  ADMIN_NO_EMAILS_YET,
  adminDealDetailResponseSchema,
  adminDealListResponseSchema,
  adminDisputeDetailResponseSchema,
  adminDisputeListResponseSchema,
  dealDetailResponseSchema,
  disputeResponseSchema,
  resendEmailResponseSchema,
} from '@valueskins/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http,
  insertDeal,
  sentEmails,
} from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';
import { adminUser } from './helpers.js';

const api = http(createApp(buildTestEnv(), { now: () => NOW }));

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

async function disputedDeal() {
  const brand = await brandWithBilling();
  const creator = await creatorWithPayout();
  const deal = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });
  const raised = await api.send('post', `/api/deals/${deal.id}/disputes`, creator.cookie, {
    subject: 'Late delivery',
    description: 'Two weeks late',
  });
  expect(raised.status).toBe(201);
  return { brand, creator, deal, dispute: disputeResponseSchema.parse(raised.body).dispute };
}

describe('every admin and dispute response matches its shared schema', () => {
  it('lists, details, resend, resolve and cancel', async () => {
    const admin = await adminUser();
    const { deal, dispute } = await disputedDeal();

    adminDealListResponseSchema.parse((await api.get('/api/admin/deals', admin.cookie)).body);
    const detail = adminDealDetailResponseSchema.parse(
      (await api.get(`/api/admin/deals/${deal.id}`, admin.cookie)).body,
    );
    adminDisputeListResponseSchema.parse((await api.get('/api/admin/disputes', admin.cookie)).body);
    adminDisputeDetailResponseSchema.parse(
      (await api.get(`/api/admin/disputes/${dispute.id}`, admin.cookie)).body,
    );

    const email = detail.emails[0]!;
    const resent = await api.send('post', `/api/admin/emails/${email.id}/resend`, admin.cookie, {});
    resendEmailResponseSchema.parse(resent.body);

    const resolved = await api.send(
      'post',
      `/api/admin/disputes/${dispute.id}/resolve`,
      admin.cookie,
      {
        resolution: 'Settled',
      },
    );
    disputeResponseSchema.parse(resolved.body);

    const cancelled = await api.send('post', `/api/admin/deals/${deal.id}/cancel`, admin.cookie, {
      note: 'Both agreed to stop',
    });
    dealDetailResponseSchema.parse(cancelled.body);
  });
});

describe('GET /api/admin/deals/:id: admin actions and party emails', () => {
  it('offers cancel and resend with reasons, and names each party with their address', async () => {
    const admin = await adminUser();
    const { brand, creator, deal } = await disputedDeal();
    const detail = adminDealDetailResponseSchema.parse(
      (await api.get(`/api/admin/deals/${deal.id}`, admin.cookie)).body,
    );
    expect(detail.adminActions).toEqual([
      { action: 'CANCEL', enabled: true, reason: null },
      { action: 'RESEND_EMAIL', enabled: true, reason: null },
    ]);
    expect(detail.parties.brand).toMatchObject({ id: brand.user.id, email: brand.user.email });
    expect(detail.parties.creator).toMatchObject({
      id: creator.user.id,
      email: creator.user.email,
    });
    // The deal itself, shared with the parties, still carries no addresses.
    expect(JSON.stringify(detail.deal)).not.toContain(brand.user.email!);
  });

  it('gives the reasons when the admin cannot act', async () => {
    const admin = await adminUser();
    const brand = await brandWithBilling();
    const open = await insertDeal(brand.user.id, 'OPEN');
    const cancelled = await insertDeal(brand.user.id, 'CANCELLED');
    const actions = async (id: string) =>
      adminDealDetailResponseSchema.parse(
        (await api.get(`/api/admin/deals/${id}`, admin.cookie)).body,
      ).adminActions;
    expect(await actions(open.id)).toEqual([
      { action: 'CANCEL', enabled: false, reason: ADMIN_CANCEL_WINDOW },
      { action: 'RESEND_EMAIL', enabled: false, reason: ADMIN_NO_EMAILS_YET },
    ]);
    expect((await actions(cancelled.id))[0]).toEqual({
      action: 'CANCEL',
      enabled: false,
      reason: ADMIN_DEAL_ALREADY_CANCELLED,
    });
  });

  it('has no address for a deleted party', async () => {
    const admin = await adminUser();
    const { creator, deal } = await disputedDeal();
    expect((await api.send('delete', '/api/me', creator.cookie)).status).toBe(200);
    const detail = adminDealDetailResponseSchema.parse(
      (await api.get(`/api/admin/deals/${deal.id}`, admin.cookie)).body,
    );
    expect(detail.parties.creator).toMatchObject({ username: 'Deleted user', email: null });
  });
});

describe('GET /api/admin/disputes: total, and the detail with its deal', () => {
  it('counts every dispute with the status filter, not only the page', async () => {
    const admin = await adminUser();
    const first = await disputedDeal();
    await disputedDeal();
    await disputedDeal();
    await api.send('post', `/api/admin/disputes/${first.dispute.id}/resolve`, admin.cookie, {
      resolution: 'Settled',
    });
    const page = adminDisputeListResponseSchema.parse(
      (await api.get('/api/admin/disputes?status=OPEN&limit=1', admin.cookie)).body,
    );
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
    const resolved = adminDisputeListResponseSchema.parse(
      (await api.get('/api/admin/disputes?status=RESOLVED', admin.cookie)).body,
    );
    expect(resolved.total).toBe(1);
  });

  it('includes the deal status, parties and amounts, and the other disputes', async () => {
    const admin = await adminUser();
    const { brand, creator, deal, dispute } = await disputedDeal();
    await api.send('post', `/api/admin/disputes/${dispute.id}/resolve`, admin.cookie, {
      resolution: 'Settled',
    });
    const second = await api.send('post', `/api/deals/${deal.id}/disputes`, brand.cookie, {
      subject: 'Again late',
      description: 'Still late',
    });
    const body = adminDisputeDetailResponseSchema.parse(
      (await api.get(`/api/admin/disputes/${second.body.dispute.id}`, admin.cookie)).body,
    );
    expect(body.deal).toMatchObject({
      id: deal.id,
      shortId: deal.shortId,
      status: 'ADVANCE_PAID',
      brand: { id: brand.user.id },
      creator: { id: creator.user.id },
      budgetPaise: deal.budgetPaise,
      advancePaise: deal.advancePaise,
      finalPaise: deal.finalPaise,
    });
    expect(body.otherDisputes).toEqual([
      { id: dispute.id, subject: 'Late delivery', status: 'RESOLVED' },
    ]);
  });

  it('is a 404 for a party and for a signed-out visitor', async () => {
    const { brand, dispute } = await disputedDeal();
    expect((await api.get(`/api/admin/disputes/${dispute.id}`, brand.cookie)).status).toBe(404);
    expect((await api.get(`/api/admin/disputes/${dispute.id}`)).status).toBe(404);
    expect((await api.get('/api/admin/disputes', brand.cookie)).status).toBe(404);
    expect(await sentEmails('ADMIN_ALERT')).toEqual([]);
  });
});
