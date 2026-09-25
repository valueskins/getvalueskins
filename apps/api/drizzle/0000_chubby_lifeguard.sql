CREATE TYPE "public"."application_status" AS ENUM('APPLIED', 'CONFIRMED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."cancelled_by_role" AS ENUM('BRAND', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."deal_event_actor_type" AS ENUM('USER', 'SYSTEM', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."deal_status" AS ENUM('DRAFT', 'OPEN', 'CONFIRMED', 'COMMISSION_PAID', 'ADVANCE_PAID', 'CONTENT_UPLOADED', 'REVISION_REQUESTED', 'APPROVED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('OPEN', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."email_log_status" AS ENUM('QUEUED', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."invoice_kind" AS ENUM('COMMISSION_TAX_INVOICE', 'ADVANCE_RECEIPT', 'FINAL_RECEIPT');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('CREATED', 'CAPTURED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('COMMISSION', 'ADVANCE', 'FINAL');--> statement-breakpoint
CREATE TYPE "public"."payout_account_status" AS ENUM('PENDING', 'ACTIVE', 'NEEDS_CLARIFICATION', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('PENDING', 'PROCESSED', 'FAILED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."transfer_type" AS ENUM('ADVANCE', 'FINAL');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('CREATOR', 'BRAND');--> statement-breakpoint
CREATE TABLE "brand_billing" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"billing_name" varchar(255) NOT NULL,
	"billing_address" text NOT NULL,
	"billing_state" varchar(100) NOT NULL,
	"gstin" varchar(15),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_payout_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"razorpay_account_id" varchar(255) NOT NULL,
	"razorpay_stakeholder_id" varchar(255) NOT NULL,
	"razorpay_product_id" varchar(255) NOT NULL,
	"status" "payout_account_status" NOT NULL,
	"bank_last4" varchar(4),
	"ifsc" varchar(11),
	"requirements" jsonb,
	"consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_payout_accounts_razorpay_account_id_unique" UNIQUE("razorpay_account_id")
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"instagram_user_id" varchar(64) NOT NULL,
	"username" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"ig_account_type" varchar(32) NOT NULL,
	"role" "user_role",
	"role_locked_at" timestamp with time zone,
	"followers_count" integer,
	"follows_count" integer,
	"media_count" integer,
	"engagement_rate" numeric(5, 2),
	"bio" text,
	"profile_picture_url" text,
	"ig_token_encrypted" text NOT NULL,
	"ig_token_expires_at" timestamp with time zone NOT NULL,
	"instagram_synced_at" timestamp with time zone,
	"email" varchar(320),
	"email_verified_at" timestamp with time zone,
	"is_admin" boolean DEFAULT false NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_instagram_user_id_unique" UNIQUE("instagram_user_id"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deal_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'APPLIED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_deal_id_creator_id_unique" UNIQUE("deal_id","creator_id")
);
--> statement-breakpoint
CREATE TABLE "content_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deal_id" uuid NOT NULL,
	"link" text NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deal_id" uuid NOT NULL,
	"from_status" "deal_status" NOT NULL,
	"to_status" "deal_status" NOT NULL,
	"actor_id" uuid,
	"actor_type" "deal_event_actor_type" NOT NULL,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"short_id" varchar(8) NOT NULL,
	"brand_id" uuid NOT NULL,
	"creator_id" uuid,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"budget_paise" bigint,
	"commission_base_paise" bigint,
	"commission_gst_paise" bigint,
	"commission_total_paise" bigint,
	"creator_amount_paise" bigint,
	"advance_paise" bigint,
	"final_paise" bigint,
	"application_deadline" date NOT NULL,
	"content_upload_deadline" date NOT NULL,
	"deal_deadline" date NOT NULL,
	"status" "deal_status" DEFAULT 'DRAFT' NOT NULL,
	"content_link" text,
	"content_uploaded_at" timestamp with time zone,
	"upload_count" integer DEFAULT 0 NOT NULL,
	"feedback" text,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"commission_paid_at" timestamp with time zone,
	"advance_paid_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_id" uuid,
	"cancelled_by_role" "cancelled_by_role",
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deals_short_id_unique" UNIQUE("short_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"kind" "invoice_kind" NOT NULL,
	"financial_year" varchar(7) NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_counters_kind_financial_year_pk" PRIMARY KEY("kind","financial_year")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deal_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"kind" "invoice_kind" NOT NULL,
	"number" varchar(32) NOT NULL,
	"financial_year" varchar(7) NOT NULL,
	"sequence" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deal_id" uuid NOT NULL,
	"type" "payment_type" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"razorpay_order_id" varchar(255) NOT NULL,
	"razorpay_payment_id" varchar(255),
	"status" "payment_status" DEFAULT 'CREATED' NOT NULL,
	"failure_reason" text,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_razorpay_order_id_unique" UNIQUE("razorpay_order_id"),
	CONSTRAINT "payments_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id")
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deal_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"type" "transfer_type" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"razorpay_transfer_id" varchar(255),
	"status" "transfer_status" DEFAULT 'PENDING' NOT NULL,
	"failure_reason" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfers_razorpay_transfer_id_unique" UNIQUE("razorpay_transfer_id")
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deal_id" uuid NOT NULL,
	"raised_by_id" uuid NOT NULL,
	"subject" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"status" "dispute_status" DEFAULT 'OPEN' NOT NULL,
	"resolution" text,
	"refund_reference" varchar(255),
	"resolved_by_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deal_id" uuid,
	"user_id" uuid,
	"to_email" varchar(320) NOT NULL,
	"cc" jsonb,
	"template" varchar(128) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"body_text" text NOT NULL,
	"attachment_names" jsonb,
	"provider_message_id" varchar(255),
	"status" "email_log_status" DEFAULT 'QUEUED' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "meta_deletion_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"instagram_user_id" varchar(64) NOT NULL,
	"confirmation_code" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "meta_deletion_requests_confirmation_code_unique" UNIQUE("confirmation_code")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "brand_billing" ADD CONSTRAINT "brand_billing_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_payout_accounts" ADD CONSTRAINT "creator_payout_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_uploads" ADD CONSTRAINT "content_uploads_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_brand_id_users_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raised_by_id_users_id_fk" FOREIGN KEY ("raised_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_payout_accounts_status_idx" ON "creator_payout_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_deleted_at_idx" ON "users" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "applications_creator_id_idx" ON "applications" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_uploads_deal_id_idx" ON "content_uploads" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "deal_events_deal_id_idx" ON "deal_events" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "deal_events_actor_id_idx" ON "deal_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "deals_brand_id_idx" ON "deals" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "deals_creator_id_idx" ON "deals" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "deals_cancelled_by_id_idx" ON "deals" USING btree ("cancelled_by_id");--> statement-breakpoint
CREATE INDEX "deals_status_idx" ON "deals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deals_application_deadline_idx" ON "deals" USING btree ("application_deadline");--> statement-breakpoint
CREATE INDEX "deals_content_upload_deadline_idx" ON "deals" USING btree ("content_upload_deadline");--> statement-breakpoint
CREATE INDEX "deals_deal_deadline_idx" ON "deals" USING btree ("deal_deadline");--> statement-breakpoint
CREATE INDEX "invoices_deal_id_idx" ON "invoices" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "invoices_payment_id_idx" ON "invoices" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "invoices_financial_year_idx" ON "invoices" USING btree ("financial_year");--> statement-breakpoint
CREATE INDEX "payments_deal_id_idx" ON "payments" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_captured_per_deal_type_idx" ON "payments" USING btree ("deal_id","type") WHERE "payments"."status" = 'CAPTURED';--> statement-breakpoint
CREATE INDEX "transfers_deal_id_idx" ON "transfers" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "transfers_payment_id_idx" ON "transfers" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "transfers_creator_id_idx" ON "transfers" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "transfers_status_idx" ON "transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "disputes_deal_id_idx" ON "disputes" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "disputes_raised_by_id_idx" ON "disputes" USING btree ("raised_by_id");--> statement-breakpoint
CREATE INDEX "disputes_resolved_by_id_idx" ON "disputes" USING btree ("resolved_by_id");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_log_deal_id_idx" ON "email_log" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "email_log_user_id_idx" ON "email_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_log_status_idx" ON "email_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_log_provider_message_id_idx" ON "email_log" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "meta_deletion_requests_instagram_user_id_idx" ON "meta_deletion_requests" USING btree ("instagram_user_id");--> statement-breakpoint
CREATE INDEX "meta_deletion_requests_status_idx" ON "meta_deletion_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_events_event_type_idx" ON "webhook_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "webhook_events_processed_at_idx" ON "webhook_events" USING btree ("processed_at");