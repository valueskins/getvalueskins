import { feeCapturedDealChangedTemplate } from './feeCapturedDealChanged.js';
import type { EmailTemplate } from '@valueskins/shared';
import type { EmailContent, EmailTemplateDataMap } from '../types.js';
import { adminAlertTemplate } from './adminAlert.js';
import { advancePaidTemplate } from './advancePaid.js';
import { applicationNotSelectedTemplate } from './applicationNotSelected.js';
import { changesRequestedTemplate } from './changesRequested.js';
import { commissionPaidBrandTemplate } from './commissionPaidBrand.js';
import { commissionPaidCreatorTemplate } from './commissionPaidCreator.js';
import { commissionPaymentReminderTemplate } from './commissionPaymentReminder.js';
import { contentApprovedTemplate } from './contentApproved.js';
import { contentOverdueTemplate } from './contentOverdue.js';
import { contentUploadedTemplate } from './contentUploaded.js';
import { dealCancelledTemplate } from './dealCancelled.js';
import { dealPublishedTemplate } from './dealPublished.js';
import { dealReportReadyTemplate } from './dealReportReady.js';
import { directPaymentConfirmReminderTemplate } from './directPaymentConfirmReminder.js';
import { directPaymentDueReminderTemplate } from './directPaymentDueReminder.js';
import { directPaymentNotReceivedTemplate } from './directPaymentNotReceived.js';
import { directPaymentRecordedTemplate } from './directPaymentRecorded.js';
import { disputeRaisedTemplate } from './disputeRaised.js';
import { disputeResolvedTemplate } from './disputeResolved.js';
import { finalPaymentDoneTemplate } from './finalPaymentDone.js';
import { launchBrandsTemplate } from './launchBrands.js';
import { launchCreatorsTemplate } from './launchCreators.js';
import { newApplicationTemplate } from './newApplication.js';
import { reviewReminderTemplate } from './reviewReminder.js';
import { signInCodeTemplate } from './signInCode.js';
import { verifyEmailTemplate } from './verifyEmail.js';
import { youWereSelectedTemplate } from './youWereSelected.js';

type TemplateRegistry = {
  [T in EmailTemplate]: (data: EmailTemplateDataMap[T]) => EmailContent;
};

export const templateRegistry: TemplateRegistry = {
  VERIFY_EMAIL: verifyEmailTemplate,
  DEAL_PUBLISHED: dealPublishedTemplate,
  NEW_APPLICATION: newApplicationTemplate,
  YOU_WERE_SELECTED: youWereSelectedTemplate,
  APPLICATION_NOT_SELECTED: applicationNotSelectedTemplate,
  COMMISSION_PAID_BRAND: commissionPaidBrandTemplate,
  COMMISSION_PAID_CREATOR: commissionPaidCreatorTemplate,
  FEE_CAPTURED_DEAL_CHANGED: feeCapturedDealChangedTemplate,
  ADVANCE_PAID: advancePaidTemplate,
  CONTENT_UPLOADED: contentUploadedTemplate,
  CHANGES_REQUESTED: changesRequestedTemplate,
  CONTENT_APPROVED: contentApprovedTemplate,
  FINAL_PAYMENT_DONE: finalPaymentDoneTemplate,
  DEAL_REPORT_READY: dealReportReadyTemplate,
  DEAL_CANCELLED: dealCancelledTemplate,
  COMMISSION_PAYMENT_REMINDER: commissionPaymentReminderTemplate,
  CONTENT_OVERDUE: contentOverdueTemplate,
  REVIEW_REMINDER: reviewReminderTemplate,
  DISPUTE_RAISED: disputeRaisedTemplate,
  DISPUTE_RESOLVED: disputeResolvedTemplate,
  DIRECT_PAYMENT_RECORDED: directPaymentRecordedTemplate,
  DIRECT_PAYMENT_NOT_RECEIVED: directPaymentNotReceivedTemplate,
  DIRECT_PAYMENT_DUE_REMINDER: directPaymentDueReminderTemplate,
  DIRECT_PAYMENT_CONFIRM_REMINDER: directPaymentConfirmReminderTemplate,
  ADMIN_ALERT: adminAlertTemplate,
  SIGN_IN_CODE: signInCodeTemplate,
  LAUNCH_BRANDS: launchBrandsTemplate,
  LAUNCH_CREATORS: launchCreatorsTemplate,
};
