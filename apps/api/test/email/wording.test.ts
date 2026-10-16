import { EMAIL_TEMPLATES } from '@valueskins/shared';
import { describe, expect, it } from 'vitest';
import { commissionPaidBrandTemplate } from '../../src/email/templates/commissionPaidBrand.js';
import { commissionPaidCreatorTemplate } from '../../src/email/templates/commissionPaidCreator.js';
import { commissionPaymentReminderTemplate } from '../../src/email/templates/commissionPaymentReminder.js';
import { dealReportReadyTemplate } from '../../src/email/templates/dealReportReady.js';
import { templateRegistry } from '../../src/email/templates/index.js';

const SAMPLE = {
  dealShortId: 'ABC12345',
  dealTitle: 'Summer campaign',
  brandName: 'Acme Inc',
  creatorUsername: 'creator1',
  commissionTotalPaise: 88_500,
  commissionBasePaise: 75_000,
  commissionGstPaise: 13_500,
  advancePaise: 273_450,
  finalPaise: 638_050,
  invoiceNumber: 'VS-2026-27-000001',
  daysLeft: 2,
};

describe('fee and deal record wording in emails', () => {
  it('email 4 (brand and creator) says "ValueSkins fee", not commission', () => {
    for (const content of [
      commissionPaidBrandTemplate(SAMPLE as never),
      commissionPaidCreatorTemplate(SAMPLE as never),
    ]) {
      expect(content.subject).toMatch(/ValueSkins fee/);
      expect(`${content.subject}\n${content.text}\n${content.html}`).not.toMatch(/commission/i);
    }
  });

  it('email 12 (fee reminder) says "ValueSkins fee", not commission', () => {
    const content = commissionPaymentReminderTemplate(SAMPLE as never);
    expect(content.subject).toMatch(/ValueSkins fee/);
    expect(`${content.subject}\n${content.text}\n${content.html}`).not.toMatch(/commission/i);
  });

  it('email 10 is the "Deal record", not the "Deal Report"', () => {
    const content = dealReportReadyTemplate(SAMPLE as never);
    expect(content.subject).toBe('Deal record ready: Summer campaign');
    expect(content.text).toContain('The deal record is attached.');
    expect(`${content.subject}\n${content.text}\n${content.html}`).not.toMatch(/report/i);
  });

  it('no email says "commission" or "Deal Report" to a user', () => {
    const data = {
      ...SAMPLE,
      verifyUrl: 'https://valueskins.com/verify/token',
      appUrl: 'https://valueskins.com',
      code: '123456',
      expiresInMinutes: 10,
      applicationDeadline: '2026-01-01',
      contentLink: 'https://drive.google.com/file/abc',
      feedback: 'Please fix the caption',
      reason: 'Changed plans',
      commissionKept: true,
      contentUploadDeadline: '2026-01-05',
      daysInReview: 3,
      stage: 'ADVANCE',
      amountPaise: 100_000,
      reference: 'UTR123456',
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
      const content = (() => {
        try {
          return templateRegistry[template](data as never);
        } catch (error) {
          throw new Error(`${template}: ${(error as Error).message}`);
        }
      })();
      const all = `${content.subject}\n${content.text}\n${content.html}`;
      expect(all, template).not.toMatch(/commission/i);
      expect(all, template).not.toMatch(/deal report/i);
    }
  });
});
