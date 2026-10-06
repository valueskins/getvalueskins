import { eq } from 'drizzle-orm';
import { setupServer } from 'msw/node';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { creatorPayoutAccounts, emailLog } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { emailUser, instagramUser } from '../helpers/auth.js';
import { buildTestEnv } from '../testEnv.js';
import {
  ECHOED_ACCOUNT_NUMBER,
  type RazorpayMockState,
  newRazorpayState,
  razorpayHandlers,
} from './razorpayMock.js';

const env = buildTestEnv();
// No waiting between retries in tests.
const app = createApp(env, { razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} } });
const origin = env.WEB_ORIGIN;
const server = setupServer();
let razorpay: RazorpayMockState;

const form = {
  legalName: 'Jane Doe',
  pan: 'ABCPE1234F',
  bankAccountNumber: '123456789012',
  ifsc: 'HDFC0001234',
  accountHolderName: 'Jane Doe',
  phone: '+91 98765 43210',
  consent: true,
};

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
  razorpay = newRazorpayState();
  creatorCount = 0;
  server.use(...razorpayHandlers(razorpay));
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(async () => {
  server.close();
  await closeDb();
});

let creatorCount = 0;
/** A creator with a verified email. The first one is creator@example.com. */
const creator = () => {
  creatorCount += 1;
  return instagramUser({
    role: 'CREATOR',
    roleLockedAt: new Date(),
    email: creatorCount === 1 ? 'creator@example.com' : `creator${creatorCount}@example.com`,
    emailVerifiedAt: new Date(),
  });
};

const submit = (cookie: string, body: object = form) =>
  request(app)
    .post('/api/me/payout-account')
    .set('Origin', origin)
    .set('Cookie', cookie)
    .send(body);
const refresh = (cookie: string) =>
  request(app)
    .post('/api/me/payout-account/refresh')
    .set('Origin', origin)
    .set('Cookie', cookie)
    .send({});
const get = (cookie: string) => request(app).get('/api/me/payout-account').set('Cookie', cookie);

const payoutRows = () => db.select().from(creatorPayoutAccounts);
const statusEmails = () =>
  db.select().from(emailLog).where(eq(emailLog.template, 'PAYOUT_ACCOUNT_STATUS'));

describe('POST /api/me/payout-account: the full sequence', () => {
  it('runs account, stakeholder, product and settlements, and stores only the allowed fields', async () => {
    const { user, cookie } = await creator();

    const response = await submit(cookie);

    expect(response.status).toBe(200);
    expect(razorpay.calls).toMatchObject({
      account: 1,
      stakeholder: 1,
      product: 1,
      settlements: 1,
    });

    const [row] = await payoutRows();
    expect(row).toMatchObject({
      userId: user.id,
      razorpayAccountId: 'acc_test1',
      razorpayStakeholderId: 'sth_test1',
      razorpayProductId: 'acc_prd_test1',
      status: 'PENDING',
      bankLast4: '9012',
      ifsc: 'HDFC0001234',
    });
    expect(row?.consentAt).not.toBeNull();
    expect(row?.statusSyncedAt).not.toBeNull();

    expect(response.body.payoutAccount).toEqual({
      status: 'PENDING',
      setupComplete: true,
      bankLast4: '9012',
      ifsc: 'HDFC0001234',
      requirements: [],
    });
  });

  it('sends the right bodies to Razorpay: phone and PAN go there, and notes.user_id instead of reference_id', async () => {
    const { user, cookie } = await creator();
    await submit(cookie);

    expect(razorpay.bodies.account).toEqual({
      type: 'route',
      email: 'creator@example.com',
      phone: '9876543210',
      legal_business_name: 'Jane Doe',
      business_type: 'individual',
      contact_name: 'Jane Doe',
      profile: {
        category: 'services',
        subcategory: 'ad_and_marketing',
        addresses: { registered: { country: 'IN' } },
      },
      notes: { user_id: user.id },
    });
    expect(razorpay.bodies.account).not.toHaveProperty('reference_id');
    expect(razorpay.bodies.account).not.toHaveProperty('legal_info');
    expect(razorpay.bodies.stakeholder).toEqual({
      name: 'Jane Doe',
      email: 'creator@example.com',
      phone: { primary: '9876543210' },
      kyc: { pan: 'ABCPE1234F' },
    });
    expect(razorpay.bodies.product).toEqual({ product_name: 'route', tnc_accepted: true });
    expect(razorpay.bodies.settlements).toEqual({
      settlements: {
        account_number: '123456789012',
        ifsc_code: 'HDFC0001234',
        beneficiary_name: 'Jane Doe',
      },
      tnc_accepted: true,
    });
  });

  it("never returns Razorpay's echoed full account number or PAN to the client", async () => {
    const { cookie } = await creator();
    const response = await submit(cookie);

    const text = JSON.stringify(response.body);
    expect(text).not.toContain(ECHOED_ACCOUNT_NUMBER);
    expect(text).not.toContain('ZZZPZ9999Z');
    expect(text).not.toContain('123456789012');
  });

  it.each([
    ['activated', 'ACTIVE'],
    ['under_review', 'PENDING'],
    ['needs_clarification', 'NEEDS_CLARIFICATION'],
    ['suspended', 'SUSPENDED'],
  ])('maps Razorpay %s to %s', async (activationStatus, expected) => {
    razorpay.activationStatus = activationStatus;
    const { cookie } = await creator();

    await submit(cookie);

    expect((await payoutRows())[0]?.status).toBe(expected);
  });

  it('stores the requirement reasons (and nothing else) for needs_clarification', async () => {
    razorpay.activationStatus = 'needs_clarification';
    razorpay.requirements = [
      {
        field_reference: 'settlements.beneficiary_name',
        reason_code: 'needs_clarification',
        status: 'required',
        resolution_url: '/accounts/acc_test1/products/acc_prd_test1',
      },
    ];
    const { cookie } = await creator();

    const response = await submit(cookie);

    expect(response.body.payoutAccount.requirements).toEqual([
      {
        fieldReference: 'settlements.beneficiary_name',
        reasonCode: 'needs_clarification',
        status: 'required',
      },
    ]);
  });

  it('emails #16 when the account is immediately ACTIVE, or needs clarification', async () => {
    razorpay.activationStatus = 'activated';
    const { cookie } = await creator();
    await submit(cookie);

    const emails = await statusEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0]?.toEmail).toBe('creator@example.com');
    expect(emails[0]?.subject).toBe('Your payout account is active');
  });

  it('sends no #16 email for PENDING', async () => {
    const { cookie } = await creator();
    await submit(cookie);
    expect(await statusEmails()).toHaveLength(0);
  });

  it('works for a creator who signed in with an email code', async () => {
    const { cookie } = await emailUser({ role: 'CREATOR', roleLockedAt: new Date() });
    expect((await submit(cookie)).status).toBe(200);
  });
});

describe('POST /api/me/payout-account: resuming after a partial failure', () => {
  it.each(['stakeholder', 'product', 'settlements'] as const)(
    'a rejection at %s keeps progress, and the retry never creates a second account',
    async (failedAt) => {
      razorpay.failures[failedAt] = { status: 400, times: 1 };
      const { cookie } = await creator();

      const first = await submit(cookie);
      expect(first.status).toBe(422);
      expect(first.body.error.code).toBe('PAYOUT_ACCOUNT_REJECTED');
      expect(await payoutRows()).toHaveLength(1);

      const second = await submit(cookie);
      expect(second.status).toBe(200);

      expect(razorpay.calls.account).toBe(1);
      expect(razorpay.calls.stakeholder).toBe(failedAt === 'stakeholder' ? 2 : 1);
      expect(razorpay.calls.product).toBe(failedAt === 'product' ? 2 : 1);
      expect(razorpay.calls.settlements).toBe(failedAt === 'settlements' ? 2 : 1);
      expect(await payoutRows()).toHaveLength(1);
    },
  );

  it('saves the account id as soon as it exists, with the later ids still empty', async () => {
    razorpay.failures.stakeholder = { status: 400, times: 1 };
    const { cookie } = await creator();

    await submit(cookie);

    const [row] = await payoutRows();
    expect(row?.razorpayAccountId).toBe('acc_test1');
    expect(row?.razorpayStakeholderId).toBeNull();
    expect(row?.razorpayProductId).toBeNull();
    expect(row?.bankLast4).toBeNull();

    const status = await get(cookie);
    expect(status.body.payoutAccount.setupComplete).toBe(false);
  });

  it('a failure creating the account leaves no row, and the retry creates it', async () => {
    razorpay.failures.account = { status: 400, times: 1 };
    const { cookie } = await creator();

    expect((await submit(cookie)).status).toBe(422);
    expect(await payoutRows()).toHaveLength(0);

    expect((await submit(cookie)).status).toBe(200);
    expect(razorpay.calls.account).toBe(2);
  });

  it('adopts an account whose creation response was lost, once notes.user_id proves it is ours', async () => {
    const { user, cookie } = await creator();
    razorpay.failures.account = {
      status: 400,
      times: 1,
      description: 'Merchant email already exists for account - acc_lost123',
    };
    razorpay.existingAccountNotes = { user_id: user.id };

    const response = await submit(cookie);

    expect(response.status).toBe(200);
    const [row] = await payoutRows();
    expect(row?.razorpayAccountId).toBe('acc_lost123');
    expect(razorpay.calls.account).toBe(1);
    expect(razorpay.calls.fetchAccount).toBe(1);
  });

  it('does not adopt an account that belongs to someone else', async () => {
    const { cookie } = await creator();
    razorpay.failures.account = {
      status: 400,
      times: 1,
      description: 'Merchant email already exists for account - acc_other999',
    };
    razorpay.existingAccountNotes = { user_id: 'some-other-user' };

    const response = await submit(cookie);

    expect(response.status).toBe(422);
    expect(await payoutRows()).toHaveLength(0);
    expect(razorpay.calls.stakeholder).toBe(0);
  });

  it('does not adopt when the existing account has empty notes (Razorpay returns [])', async () => {
    const { cookie } = await creator();
    razorpay.failures.account = {
      status: 400,
      times: 1,
      description: 'Merchant email already exists for account - acc_other999',
    };
    razorpay.existingAccountNotes = [];

    expect((await submit(cookie)).status).toBe(422);
    expect(await payoutRows()).toHaveLength(0);
  });

  it('refuses a second setup while one is running, and creates only one account', async () => {
    razorpay.settlementsDelayMs = 400;
    const { cookie } = await creator();

    const [first, second] = await Promise.all([submit(cookie), submit(cookie)]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const blocked = first.status === 409 ? first : second;
    expect(blocked.body.error.code).toBe('PAYOUT_SETUP_IN_PROGRESS');
    expect(razorpay.calls.account).toBe(1);
    expect(await payoutRows()).toHaveLength(1);
  });

  it('answers 409 PAYOUT_ACCOUNT_EXISTS once setup is complete and nothing needs fixing', async () => {
    const { cookie } = await creator();
    await submit(cookie);

    const again = await submit(cookie);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PAYOUT_ACCOUNT_EXISTS');
    expect(razorpay.calls.account).toBe(1);
    expect(razorpay.calls.settlements).toBe(1);
  });

  it('after NEEDS_CLARIFICATION, submitting again re-sends the settlement details only', async () => {
    razorpay.activationStatus = 'needs_clarification';
    const { cookie } = await creator();
    await submit(cookie);

    razorpay.activationStatus = 'under_review';
    const fixed = await submit(cookie, { ...form, bankAccountNumber: '555566667777' });

    expect(fixed.status).toBe(200);
    expect(razorpay.calls).toMatchObject({
      account: 1,
      stakeholder: 1,
      product: 1,
      settlements: 2,
    });
    expect(razorpay.bodies.settlements).toMatchObject({
      settlements: { account_number: '555566667777' },
    });
    expect(fixed.body.payoutAccount).toMatchObject({ status: 'PENDING', bankLast4: '7777' });
  });
});

describe('Razorpay retries (SPEC 13)', () => {
  it('retries a 5xx and then succeeds, as one logical setup', async () => {
    razorpay.failures.account = { status: 503, times: 2 };
    const { cookie } = await creator();

    const response = await submit(cookie);

    expect(response.status).toBe(200);
    expect(razorpay.calls.account).toBe(3);
    expect(await payoutRows()).toHaveLength(1);
  });

  it('retries a network error', async () => {
    razorpay.failures.stakeholder = { status: 'network', times: 1 };
    const { cookie } = await creator();

    expect((await submit(cookie)).status).toBe(200);
    expect(razorpay.calls.stakeholder).toBe(2);
  });

  it('gives up after 3 retries (4 attempts) with 502 RAZORPAY_UNAVAILABLE', async () => {
    razorpay.failures.account = { status: 500, times: 99 };
    const { cookie } = await creator();

    const response = await submit(cookie);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('RAZORPAY_UNAVAILABLE');
    expect(razorpay.calls.account).toBe(4);
  });

  it('never retries a 4xx', async () => {
    razorpay.failures.account = { status: 400, times: 99 };
    const { cookie } = await creator();

    const response = await submit(cookie);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('PAYOUT_ACCOUNT_REJECTED');
    expect(razorpay.calls.account).toBe(1);
  });

  it("tells the creator only the field name, never Razorpay's description", async () => {
    razorpay.failures.account = {
      status: 400,
      times: 1,
      description: 'phone 9876543210 is not valid for PAN ABCPE1234F',
    };
    const { cookie } = await creator();

    const response = await submit(cookie);

    expect(response.body.error.details).toEqual({ field: 'phone' });
    const text = JSON.stringify(response.body);
    expect(text).not.toContain('9876543210');
    expect(text).not.toContain('ABCPE1234F');
  });
});

describe('payout account preconditions', () => {
  it('401 with no session', async () => {
    const response = await request(app)
      .post('/api/me/payout-account')
      .set('Origin', origin)
      .send(form);
    expect(response.status).toBe(401);
  });

  it('is for creators only: a brand gets 403 WRONG_ROLE and Razorpay is never called', async () => {
    const { cookie } = await instagramUser({ role: 'BRAND', roleLockedAt: new Date() });

    const response = await submit(cookie);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('WRONG_ROLE');
    expect(razorpay.calls.account).toBe(0);
  });

  it('needs a role first', async () => {
    const { cookie } = await instagramUser();
    const response = await submit(cookie);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROLE_NOT_CHOSEN');
  });

  it('needs a verified email: 409 EMAIL_NOT_VERIFIED, Razorpay never called', async () => {
    const { cookie } = await instagramUser({ role: 'CREATOR', roleLockedAt: new Date() });

    const response = await submit(cookie);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(razorpay.calls.account).toBe(0);
  });

  it.each([
    ['a PAN whose 4th character is not P', { pan: 'ABCDE1234F' }],
    ['a missing phone', { phone: undefined }],
    ['an invalid IFSC', { ifsc: 'nope' }],
    ['a short legal name', { legalName: 'Raj' }],
    ['consent false', { consent: false }],
    ['an unknown field', { extra: 'x' }],
  ])('rejects %s with 400 and never calls Razorpay', async (_label, override) => {
    const { cookie } = await creator();

    const response = await submit(cookie, { ...form, ...override });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(razorpay.calls.account).toBe(0);
  });
});

describe('GET /api/me/payout-account and refresh', () => {
  it('GET is null before setup, and shows the status after', async () => {
    const { cookie } = await creator();

    expect((await get(cookie)).body).toEqual({ payoutAccount: null });
    await submit(cookie);
    expect((await get(cookie)).body.payoutAccount).toMatchObject({
      status: 'PENDING',
      bankLast4: '9012',
      ifsc: 'HDFC0001234',
    });
  });

  it('GET is creators only', async () => {
    const { cookie } = await instagramUser({ role: 'BRAND', roleLockedAt: new Date() });
    expect((await get(cookie)).status).toBe(403);
  });

  it("a creator cannot see another creator's account", async () => {
    const a = await creator();
    await submit(a.cookie);
    const b = await creator();

    expect((await get(b.cookie)).body).toEqual({ payoutAccount: null });
  });

  it('refresh answers 409 SETUP_INCOMPLETE before the product exists', async () => {
    const { cookie } = await creator();
    expect((await refresh(cookie)).body.error.code).toBe('SETUP_INCOMPLETE');

    razorpay.failures.product = { status: 400, times: 1 };
    await submit(cookie);
    const response = await refresh(cookie);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SETUP_INCOMPLETE');
  });

  it('refresh fetches the status from Razorpay, emails #16 once, and not again', async () => {
    const { cookie } = await creator();
    await submit(cookie);
    expect(await statusEmails()).toHaveLength(0);

    razorpay.activationStatus = 'activated';
    const first = await refresh(cookie);
    const second = await refresh(cookie);

    expect(first.body.payoutAccount.status).toBe('ACTIVE');
    expect(second.body.payoutAccount.status).toBe('ACTIVE');
    expect(razorpay.calls.fetchProduct).toBe(2);
    expect(await statusEmails()).toHaveLength(1);
  });

  it('refresh maps a Razorpay outage to 502 and leaves the status alone', async () => {
    const { cookie } = await creator();
    await submit(cookie);
    razorpay.failures.fetchProduct = { status: 500, times: 99 };

    const response = await refresh(cookie);

    expect(response.status).toBe(502);
    expect((await payoutRows())[0]?.status).toBe('PENDING');
  });
});
