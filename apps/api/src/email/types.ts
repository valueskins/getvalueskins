export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

/** One entry per EmailTemplate value, with exactly the dynamic fields that
 * template needs (SPEC 8 + the V0_LAUNCH 2.1 sign-in code). */
export interface EmailTemplateDataMap {
  VERIFY_EMAIL: { verifyUrl: string };
  DEAL_PUBLISHED: { dealShortId: string; dealTitle: string; applicationDeadline: string };
  NEW_APPLICATION: { dealShortId: string; dealTitle: string; creatorUsername: string };
  YOU_WERE_SELECTED: { dealShortId: string; dealTitle: string; brandName: string };
  APPLICATION_NOT_SELECTED: { dealShortId: string; dealTitle: string };
  COMMISSION_PAID_BRAND: { dealShortId: string; dealTitle: string; commissionTotalPaise: number };
  COMMISSION_PAID_CREATOR: { dealShortId: string; dealTitle: string };
  FEE_CAPTURED_DEAL_CHANGED: { dealShortId: string; dealTitle: string; amountPaise: number };
  ADVANCE_PAID: { dealShortId: string; dealTitle: string; advancePaise: number };
  DIRECT_PAYMENT_RECORDED: {
    dealShortId: string;
    dealTitle: string;
    stage: 'ADVANCE' | 'FINAL';
    amountPaise: number;
    reference: string;
  };
  DIRECT_PAYMENT_NOT_RECEIVED: {
    dealShortId: string;
    dealTitle: string;
    stage: 'ADVANCE' | 'FINAL';
    amountPaise: number;
    reference: string;
    reason: string;
  };
  CONTENT_UPLOADED: { dealShortId: string; dealTitle: string; contentLink: string };
  CHANGES_REQUESTED: { dealShortId: string; dealTitle: string; feedback: string };
  CONTENT_APPROVED: { dealShortId: string; dealTitle: string };
  FINAL_PAYMENT_DONE: { dealShortId: string; dealTitle: string; finalPaise: number };
  DEAL_REPORT_READY: { dealShortId: string; dealTitle: string };
  DEAL_CANCELLED: {
    dealShortId: string;
    dealTitle: string;
    reason: string;
    commissionKept: boolean;
  };
  COMMISSION_PAYMENT_REMINDER: {
    dealShortId: string;
    dealTitle: string;
    commissionTotalPaise: number;
  };
  CONTENT_OVERDUE: { dealShortId: string; dealTitle: string; contentUploadDeadline: string };
  REVIEW_REMINDER: { dealShortId: string; dealTitle: string; daysInReview: number };
  DISPUTE_RAISED: {
    dealShortId: string;
    dealTitle: string;
    disputeSubject: string;
    disputeDescription: string;
    raisedByUsername: string;
  };
  DISPUTE_RESOLVED: {
    dealShortId: string;
    dealTitle: string;
    disputeSubject: string;
    resolution: string;
    refundReference: string | null;
  };
  DIRECT_PAYMENT_DUE_REMINDER: {
    dealShortId: string;
    dealTitle: string;
    stage: 'ADVANCE' | 'FINAL';
    amountPaise: number;
  };
  DIRECT_PAYMENT_CONFIRM_REMINDER: {
    dealShortId: string;
    dealTitle: string;
    stage: 'ADVANCE' | 'FINAL';
    amountPaise: number;
  };
  ADMIN_ALERT: { subjectLine: string; details: string };
  SIGN_IN_CODE: { code: string; expiresInMinutes: number };
}
