import { EMAIL_TEMPLATES } from '@valueskins/shared';
import { describe, expect, it } from 'vitest';
import { templateRegistry } from '../../src/email/templates/index.js';
import { signInCodeTemplate } from '../../src/email/templates/signInCode.js';
import { dealCancelledTemplate } from '../../src/email/templates/dealCancelled.js';
import { adminAlertTemplate } from '../../src/email/templates/adminAlert.js';

const MARKETING_WORDS = /\b(unlock|seamless|powered by|effortless|supercharge)\b/i;

describe('email templates', () => {
  it('has a registry entry for every EMAIL_TEMPLATES value', () => {
    for (const template of EMAIL_TEMPLATES) {
      expect(templateRegistry[template]).toBeTypeOf('function');
    }
  });

  it('signInCodeTemplate interpolates the code and expiry', () => {
    const content = signInCodeTemplate({ code: '482910', expiresInMinutes: 10 });
    expect(content.subject).toBe('Your sign-in code');
    expect(content.text).toContain('482910');
    expect(content.text).toContain('10 minutes');
    expect(content.html).toContain('482910');
  });

  it('dealCancelledTemplate reflects whether the fee was kept', () => {
    const kept = dealCancelledTemplate({
      dealShortId: 'ABC12345',
      dealTitle: 'Summer campaign',
      reason: 'Brand changed plans',
      commissionKept: true,
    });
    expect(kept.text).toContain('fee already paid was kept');

    const notKept = dealCancelledTemplate({
      dealShortId: 'ABC12345',
      dealTitle: 'Summer campaign',
      reason: 'Brand changed plans',
      commissionKept: false,
    });
    expect(notKept.text).toContain('No fee was charged');
  });

  it('adminAlertTemplate includes the subject line and details', () => {
    const content = adminAlertTemplate({
      subjectLine: 'Webhook processing failed',
      details: 'event id abc123',
    });
    expect(content.subject).toContain('Webhook processing failed');
    expect(content.text).toContain('event id abc123');
  });

  it('no template output contains an em dash or a marketing word', () => {
    const sampleData: Record<string, unknown> = {
      verifyUrl: 'https://valueskins.com/verify/token',
      code: '123456',
      expiresInMinutes: 10,
      dealShortId: 'ABC12345',
      dealTitle: 'Summer campaign',
      applicationDeadline: '2026-01-01',
      creatorUsername: 'creator1',
      brandName: 'Acme Inc',
      commissionTotalPaise: 75_000,
      advancePaise: 100_000,
      finalPaise: 200_000,
      contentLink: 'https://drive.google.com/file/abc',
      feedback: 'Please fix the caption',
      reason: 'Changed plans',
      commissionKept: true,
      contentUploadDeadline: '2026-01-05',
      daysInReview: 3,
      stage: 'ADVANCE',
      amountPaise: 100_000,
      reference: 'UTR123456',
      reason: 'Nothing arrived',
      disputeSubject: 'Payment issue',
      disputeDescription: 'Details here',
      resolution: 'Refunded in full',
      refundReference: 'rfnd_123',
      raisedByUsername: 'brand1',
      status: 'ACTIVE',
      subjectLine: 'Alert',
      details: 'Something happened',
    };

    for (const template of EMAIL_TEMPLATES) {
      const content = templateRegistry[template](sampleData as never);
      expect(content.text).not.toMatch(/—/);
      expect(content.text).not.toMatch(MARKETING_WORDS);
      expect(content.html).not.toMatch(MARKETING_WORDS);
    }
  });
});

describe('HTML escaping of user-supplied text', () => {
  const hostile = '<script>alert("x")</script> & "q"';
  const escaped = '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;q&quot;';

  it('escapes every user-supplied field in the HTML body but not in the plain text', () => {
    const rendered = [
      templateRegistry.DEAL_PUBLISHED({
        dealShortId: 'ABC12345',
        dealTitle: hostile,
        applicationDeadline: '2026-10-12',
      }),
      templateRegistry.NEW_APPLICATION({
        dealShortId: 'ABC12345',
        dealTitle: 'Deal',
        creatorUsername: hostile,
      }),
      templateRegistry.YOU_WERE_SELECTED({
        dealShortId: 'ABC12345',
        dealTitle: 'Deal',
        brandName: hostile,
      }),
      templateRegistry.APPLICATION_NOT_SELECTED({ dealShortId: 'ABC12345', dealTitle: hostile }),
      templateRegistry.DEAL_CANCELLED({
        dealShortId: 'ABC12345',
        dealTitle: 'Deal',
        reason: hostile,
        commissionKept: false,
      }),
      templateRegistry.CHANGES_REQUESTED({
        dealShortId: 'ABC12345',
        dealTitle: 'Deal',
        feedback: hostile,
      }),
    ];
    for (const content of rendered) {
      expect(content.html).not.toContain('<script>');
      expect(content.html).toContain(escaped);
    }
    expect(rendered[0]?.text).toContain('<script>');
  });
});

describe('payment reminder emails (19 and 20)', () => {
  const hostile = '<b>"Deal"</b> & co';

  it('19 asks the brand to pay and record the payment, with the amount, and no UPI ID', () => {
    const content = templateRegistry.DIRECT_PAYMENT_DUE_REMINDER({
      dealShortId: 'ABC12345',
      dealTitle: hostile,
      stage: 'ADVANCE',
      amountPaise: 273_450,
    });
    expect(content.subject).toContain('advance payment due');
    expect(content.text).toContain('The advance of ₹2,734.50');
    expect(content.text).toContain('Pay the creator by UPI, then record the payment');
    expect(content.text).not.toMatch(/@[a-z]+/i);
    expect(content.html).toContain('&lt;b&gt;&quot;Deal&quot;&lt;/b&gt; &amp; co');
    expect(content.html).not.toContain('<b>');
  });

  it('20 asks the creator to confirm, or say it did not arrive, and says which stage', () => {
    const advance = templateRegistry.DIRECT_PAYMENT_CONFIRM_REMINDER({
      dealShortId: 'ABC12345',
      dealTitle: hostile,
      stage: 'ADVANCE',
      amountPaise: 273_450,
    });
    const final = templateRegistry.DIRECT_PAYMENT_CONFIRM_REMINDER({
      dealShortId: 'ABC12345',
      dealTitle: 'Deal',
      stage: 'FINAL',
      amountPaise: 638_050,
    });
    expect(advance.text).toContain('recorded an advance payment of ₹2,734.50');
    expect(final.text).toContain('recorded a final payment of ₹6,380.50');
    expect(advance.text).toContain('Check your UPI app');
    expect(advance.text).toContain('If it did not arrive, say so');
    expect(advance.html).not.toContain('<b>');
    expect(advance.text).not.toMatch(/@[a-z]+/i);
  });
});

describe('dispute emails', () => {
  it('15b names the dispute, the resolution and the refund reference, and escapes user text', () => {
    const content = templateRegistry.DISPUTE_RESOLVED({
      dealShortId: 'ABC12345',
      dealTitle: 'Summer <campaign>',
      disputeSubject: 'Late & wrong',
      resolution: 'Refunded <b>in full</b>',
      refundReference: 'rfnd_123',
    });
    expect(content.subject).toBe('Dispute resolved: Summer <campaign>');
    expect(content.text).toContain('Refunded <b>in full</b>');
    expect(content.text).toContain('Refund reference: rfnd_123');
    expect(content.html).toContain('Refunded &lt;b&gt;in full&lt;/b&gt;');
    expect(content.html).toContain('Late &amp; wrong');
    expect(content.html).not.toContain('<b>in full</b>');
  });

  it('15b leaves the refund line out when there is no reference', () => {
    const content = templateRegistry.DISPUTE_RESOLVED({
      dealShortId: 'ABC12345',
      dealTitle: 'Deal',
      disputeSubject: 'Subject',
      resolution: 'Settled',
      refundReference: null,
    });
    expect(content.text).not.toContain('Refund reference');
    expect(content.html).not.toContain('Refund reference');
  });

  it('15 escapes the dispute text in the HTML body', () => {
    const content = templateRegistry.DISPUTE_RAISED({
      dealShortId: 'ABC12345',
      dealTitle: 'Deal',
      disputeSubject: '<i>Hi</i>',
      disputeDescription: 'a & b',
      raisedByUsername: 'x',
    });
    expect(content.html).toContain('&lt;i&gt;Hi&lt;/i&gt;');
    expect(content.html).toContain('a &amp; b');
  });
});
