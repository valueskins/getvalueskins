import { eq } from 'drizzle-orm';
import { HttpResponse, http as mswHttp } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { emailLog } from '../../src/db/schema/index.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, http as api } from '../helpers/deals.js';
import { runDeal } from '../helpers/lifecycle.js';
import {
  newOrdersState,
  ordersHandlers,
  type OrdersMockState,
} from '../payments/razorpayOrdersMock.js';
import { buildTestEnv } from '../testEnv.js';
import { adminUser } from './helpers.js';

const env = buildTestEnv({ EMAIL_TRANSPORT: 'resend' });
const app = createApp(env, {
  now: () => NOW,
  razorpayClientOptions: { baseDelayMs: 0, sleep: async () => {} },
});
const call = api(app);
const server = setupServer();
let razorpay: OrdersMockState;

interface ResendBody {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html: string;
  // The Resend SDK serialises a Buffer as { type: 'Buffer', data: [...] }.
  attachments?: Array<{ filename: string; content: { type: 'Buffer'; data: number[] } }>;
}
let sent: ResendBody[];

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
  razorpay = newOrdersState();
  sent = [];
  server.use(
    ...ordersHandlers(razorpay),
    mswHttp.post('https://api.resend.com/emails', async ({ request }) => {
      sent.push((await request.json()) as ResendBody);
      return HttpResponse.json({ id: `email_${sent.length}` });
    }),
  );
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await closeDb();
});

const resend = (cookie: string, id: string) =>
  call.send('post', `/api/admin/emails/${id}/resend`, cookie, {});

describe('POST /api/admin/emails/:id/resend', () => {
  it('resends the stored text with the PDF rebuilt byte for byte, as a new email_log row', async () => {
    const admin = await adminUser();
    const { brand, deal } = await runDeal(call, razorpay, 'COMPLETED');
    const [original] = await db
      .select()
      .from(emailLog)
      .where(eq(emailLog.template, 'COMMISSION_PAID_BRAND'));
    expect(original?.attachmentNames).toEqual(['VS-2026-27-000001.pdf']);
    const first = sent.find((s) => s.subject === original?.subject && s.to[0] === brand.user.email);
    expect(first?.attachments).toHaveLength(1);
    const before = sent.length;

    const res = await resend(admin.cookie, original!.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'SENT', missingAttachments: [] });
    expect(res.body.emailLogId).not.toBe(original!.id);

    expect(sent).toHaveLength(before + 1);
    const again = sent[sent.length - 1]!;
    expect(again).toMatchObject({
      to: [brand.user.email],
      subject: original!.subject,
      text: original!.bodyText,
    });
    expect(again.attachments).toHaveLength(1);
    expect(again.attachments?.[0]?.filename).toBe('VS-2026-27-000001.pdf');
    expect(again.attachments?.[0]?.content).toEqual(first?.attachments?.[0]?.content);

    const rows = await db.select().from(emailLog).where(eq(emailLog.dealId, deal.id));
    const copy = rows.find((r) => r.id === res.body.emailLogId);
    expect(copy).toMatchObject({
      template: 'COMMISSION_PAID_BRAND',
      toEmail: brand.user.email,
      userId: brand.user.id,
      dealId: deal.id,
      subject: original!.subject,
      bodyText: original!.bodyText,
      attachmentNames: ['VS-2026-27-000001.pdf'],
      status: 'SENT',
    });
    expect(rows.find((r) => r.id === original!.id)).toMatchObject({ status: 'SENT' });
  });

  it('rebuilds the deal report for the completion email', async () => {
    const admin = await adminUser();
    const { deal } = await runDeal(call, razorpay, 'COMPLETED');
    const [original] = await db
      .select()
      .from(emailLog)
      .where(eq(emailLog.template, 'DEAL_REPORT_READY'));
    expect(original?.attachmentNames).toEqual([`ValueSkins-Deal-Record-${deal.shortId}.pdf`]);

    const res = await resend(admin.cookie, original!.id);
    expect(res.status).toBe(200);
    expect(res.body.missingAttachments).toEqual([]);
    const last = sent[sent.length - 1]!;
    expect(last.attachments?.[0]?.filename).toBe(`ValueSkins-Deal-Record-${deal.shortId}.pdf`);
    expect(last.attachments?.[0]?.content.data.length).toBeGreaterThan(1000);
  });

  it('still rebuilds the deal record for an email stored with the old "Deal Report" file name', async () => {
    const admin = await adminUser();
    const { deal } = await runDeal(call, razorpay, 'COMPLETED');
    const [original] = await db
      .select()
      .from(emailLog)
      .where(eq(emailLog.template, 'DEAL_REPORT_READY'));
    const oldName = `ValueSkins-Deal-Report-${deal.shortId}.pdf`;
    await db
      .update(emailLog)
      .set({ attachmentNames: [oldName] })
      .where(eq(emailLog.id, original!.id));

    const res = await resend(admin.cookie, original!.id);
    expect(res.status).toBe(200);
    expect(res.body.missingAttachments).toEqual([]);
    const last = sent[sent.length - 1]!;
    // The old name is recognised, and the file is rebuilt under the current name.
    expect(last.attachments?.[0]?.filename).toBe(`ValueSkins-Deal-Record-${deal.shortId}.pdf`);
    expect(last.attachments?.[0]?.content.data.length).toBeGreaterThan(1000);
  });

  it('keeps the CC list, and reports an attachment it cannot rebuild instead of failing', async () => {
    const admin = await adminUser();
    const { deal } = await runDeal(call, razorpay, 'COMMISSION_PAID');
    const [stored] = await db
      .insert(emailLog)
      .values({
        dealId: deal.id,
        toEmail: 'valueskinsfounder@gmail.com',
        cc: ['a@example.com', 'b@example.com'],
        template: 'DISPUTE_RAISED',
        subject: 'Dispute raised: X',
        bodyText: 'Line one\n\nLine <two> & more',
        attachmentNames: ['gone.pdf'],
        status: 'FAILED',
        error: 'provider down',
      })
      .returning();

    const res = await resend(admin.cookie, stored!.id);
    expect(res.status).toBe(200);
    expect(res.body.missingAttachments).toEqual(['gone.pdf']);
    const last = sent[sent.length - 1]!;
    expect(last).toMatchObject({
      to: ['valueskinsfounder@gmail.com'],
      cc: ['a@example.com', 'b@example.com'],
      subject: 'Dispute raised: X',
    });
    expect(last.attachments ?? []).toHaveLength(0);
    expect(last.html).toContain('Line &lt;two&gt; &amp; more');
    // The failed original is untouched.
    expect((await db.select().from(emailLog).where(eq(emailLog.id, stored!.id)))[0]?.status).toBe(
      'FAILED',
    );
  });

  it('is 404 for an unknown or malformed id', async () => {
    const admin = await adminUser();
    expect((await resend(admin.cookie, '0197c0a0-0000-7000-8000-000000000000')).status).toBe(404);
    expect((await resend(admin.cookie, 'nope')).status).toBe(404);
  });
});
