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

  it('dealCancelledTemplate reflects whether the commission was kept', () => {
    const kept = dealCancelledTemplate({
      dealShortId: 'ABC12345',
      dealTitle: 'Summer campaign',
      reason: 'Brand changed plans',
      commissionKept: true,
    });
    expect(kept.text).toContain('commission already paid was kept');

    const notKept = dealCancelledTemplate({
      dealShortId: 'ABC12345',
      dealTitle: 'Summer campaign',
      reason: 'Brand changed plans',
      commissionKept: false,
    });
    expect(notKept.text).toContain('No commission was charged');
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
      disputeSubject: 'Payment issue',
      disputeDescription: 'Details here',
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
