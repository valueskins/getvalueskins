import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import {
  dealEvents,
  disputes,
  emailLog,
  invoices,
  directPayments,
  payments,
  webhookEvents,
} from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import {
  NOW,
  brandWithBilling,
  creatorWithPayout,
  http,
  insertApplication,
  insertDeal,
} from '../helpers/deals.js';
import { adminUser } from '../admin/helpers.js';
import { buildTestEnv } from '../testEnv.js';

// Capture every log line the API writes, to prove a UPI ID never reaches them.
const captured = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock('../../src/logging/logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/logging/logger.js')>();
  process.env.LOG_LEVEL = 'debug';
  return {
    ...actual,
    logger: actual.buildLogger({
      write: (chunk: string) => {
        captured.lines.push(chunk);
      },
    }),
  };
});

const env = buildTestEnv();
const api = http(createApp(env, { now: () => NOW }));

beforeAll(resetDb);
beforeEach(async () => {
  await truncateAll();
  captured.lines.length = 0;
});
afterAll(closeDb);

const VPA = 'sweep.creator@okhdfcbank';
const NAME = 'Sweep Creator Name';
const SECRETS = [VPA, 'sweep.creator', NAME];

async function creatorWhoSaved() {
  const creator = await creatorWithPayout(null);
  const res = await api.send('put', '/api/me/payout-upi', creator.cookie, {
    vpa: VPA,
    name: NAME,
    consent: true,
  });
  expect(res.status).toBe(200);
  return creator;
}

function expectNoSecrets(label: string, text: string, options: { nameAllowed?: boolean } = {}) {
  for (const secret of SECRETS) {
    if (secret === NAME && options.nameAllowed) continue;
    expect(text, `${label} contains ${secret}`).not.toContain(secret);
  }
}

describe('the full UPI ID is shown only to the confirmed brand while a payment is due (see directPayments tests)', () => {
  it('appears in no response, whoever asks', async () => {
    const creator = await creatorWhoSaved();
    const brand = await brandWithBilling();
    const other = await creatorWithPayout();
    const admin = await adminUser();
    const open = await insertDeal(brand.user.id, 'OPEN');
    await insertApplication(open.id, creator.user.id);
    const confirmed = await insertDeal(brand.user.id, 'CONFIRMED', { creatorId: creator.user.id });
    const advance = await insertDeal(brand.user.id, 'ADVANCE_PAID', { creatorId: creator.user.id });

    const calls: Array<[string, string, string | undefined]> = [];
    for (const [who, cookie] of [
      ['creator', creator.cookie],
      ['brand', brand.cookie],
      ['other creator', other.cookie],
      ['admin', admin.cookie],
      ['signed out', undefined],
    ] as const) {
      calls.push(
        [who, '/api/me', cookie],
        [who, '/api/me/payout-upi', cookie],
        [who, `/api/users/${creator.user.id}/resume`, cookie],
        [who, '/api/deals/feed', cookie],
        [who, '/api/deals/mine', cookie],
        [who, '/api/applications/mine', cookie],
        [who, `/api/deals/${open.id}`, cookie],
        [who, `/api/deals/${open.id}/applications`, cookie],
        [who, `/api/deals/${confirmed.id}`, cookie],
        [who, `/api/deals/${advance.id}`, cookie],
        [who, `/api/deals/${advance.id}/emails`, cookie],
        [who, `/api/deals/${advance.id}/events`, cookie],
        [who, `/api/deals/${confirmed.id}/direct-payment`, cookie],
        [who, `/api/deals/${advance.id}/direct-payment`, cookie],
        [who, '/api/admin/deals', cookie],
        [who, `/api/admin/deals/${advance.id}`, cookie],
        [who, '/api/admin/disputes', cookie],
      );
    }
    let answered = 0;
    for (const [who, path, cookie] of calls) {
      const res = await api.get(path, cookie);
      if (res.status === 200) answered += 1;
      // A creator's own settings show them their name; nobody else's response may.
      const own = who === 'creator' && path === '/api/me/payout-upi';
      expectNoSecrets(`${who} ${path}`, JSON.stringify(res.body) + res.text, { nameAllowed: own });
    }
    expect(answered).toBeGreaterThan(30);
  });

  it('appears in no stored email, event, payment, direct payment, invoice, dispute or webhook row', async () => {
    const creator = await creatorWhoSaved();
    const brand = await brandWithBilling();
    const open = await insertDeal(brand.user.id, 'OPEN');
    // Apply, then a dispute-free confirmation path: these write emails and events.
    expect(
      (await api.send('post', `/api/deals/${open.id}/applications`, creator.cookie, {})).status,
    ).toBe(201);
    const [application] = (await api.get(`/api/deals/${open.id}/applications`, brand.cookie)).body
      .items;
    expect(
      (await api.send('post', `/api/applications/${application.id}/confirm`, brand.cookie, {}))
        .status,
    ).toBe(200);

    const dump = JSON.stringify({
      emails: await db.select().from(emailLog),
      events: await db.select().from(dealEvents),
      payments: await db.select().from(payments),
      directPayments: await db.select().from(directPayments),
      invoices: await db.select().from(invoices),
      disputes: await db.select().from(disputes),
      webhooks: await db.select().from(webhookEvents),
    });
    expect(dump.length).toBeGreaterThan(100);
    expectNoSecrets('database dump', dump);
  });
});

describe('no log line carries a UPI ID', () => {
  it('through saving, a refused save, reading, applying, being confirmed and deleting the account', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout(null);
    const open = await insertDeal(brand.user.id, 'OPEN');

    // A refused apply, a refused save (typed IDs and numbers), then a good save.
    await api.send('post', `/api/deals/${open.id}/applications`, creator.cookie, {});
    for (const typed of ['123456789012', 'ABCPE1234F', 'HDFC0001234', 'not a upi id', VPA + ' x']) {
      await api.send('put', '/api/me/payout-upi', creator.cookie, {
        vpa: typed,
        name: NAME,
        consent: true,
      });
    }
    await api.send('put', '/api/me/payout-upi', creator.cookie, {
      vpa: VPA,
      name: NAME,
      consent: true,
    });
    await api.get('/api/me/payout-upi', creator.cookie);
    await api.get('/api/me', creator.cookie);
    await api.send('post', `/api/deals/${open.id}/applications`, creator.cookie, {});
    const [application] = (await api.get(`/api/deals/${open.id}/applications`, brand.cookie)).body
      .items;
    await api.send('post', `/api/applications/${application.id}/confirm`, brand.cookie, {});
    await api.send('delete', '/api/me', creator.cookie);

    const logs = captured.lines.join('\n');
    // The capture works: requests were logged.
    expect(logs).toContain('request completed');
    expect(logs.length).toBeGreaterThan(500);
    for (const secret of [VPA, 'sweep.creator', 'not a upi id', '123456789012', 'ABCPE1234F']) {
      expect(logs, `a log line contains ${secret}`).not.toContain(secret);
    }
    expect(logs).not.toContain(NAME);
  });
});
