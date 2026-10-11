CREATE TYPE "public"."direct_payment_stage" AS ENUM('ADVANCE', 'FINAL');--> statement-breakpoint
CREATE TABLE "direct_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deal_id" uuid NOT NULL,
	"stage" "direct_payment_stage" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"reference" varchar(40) NOT NULL,
	"paid_to_vpa" text NOT NULL,
	"note" text,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"disputed_at" timestamp with time zone,
	"dispute_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direct_payments_not_confirmed_and_disputed_check" CHECK ("direct_payments"."confirmed_at" is null or "direct_payments"."disputed_at" is null),
	CONSTRAINT "direct_payments_confirmed_by_check" CHECK (("direct_payments"."confirmed_by" is null) = ("direct_payments"."confirmed_at" is null)),
	CONSTRAINT "direct_payments_dispute_reason_check" CHECK (("direct_payments"."dispute_reason" is null) = ("direct_payments"."disputed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "transfers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "transfers" CASCADE;--> statement-breakpoint
-- Prompt 13: the old Route advance and final payments, and their receipts, are test data only
-- (REPLACEMENT_PLAN 0). They go before the enums are narrowed and the receipt kinds renamed,
-- so no row holds a value the new enums do not have.
DELETE FROM "invoices" WHERE "kind" IN ('ADVANCE_RECEIPT', 'FINAL_RECEIPT');--> statement-breakpoint
DELETE FROM "invoice_counters" WHERE "kind" IN ('ADVANCE_RECEIPT', 'FINAL_RECEIPT');--> statement-breakpoint
DELETE FROM "payments" WHERE "type" IN ('ADVANCE', 'FINAL');--> statement-breakpoint
ALTER TABLE "invoice_counters" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."invoice_kind";--> statement-breakpoint
CREATE TYPE "public"."invoice_kind" AS ENUM('COMMISSION_TAX_INVOICE', 'ADVANCE_PAYMENT_RECORD', 'FINAL_PAYMENT_RECORD');--> statement-breakpoint
ALTER TABLE "invoice_counters" ALTER COLUMN "kind" SET DATA TYPE "public"."invoice_kind" USING "kind"::"public"."invoice_kind";--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "kind" SET DATA TYPE "public"."invoice_kind" USING "kind"::"public"."invoice_kind";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."payment_type";--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('COMMISSION');--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "type" SET DATA TYPE "public"."payment_type" USING "type"::"public"."payment_type";--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "payment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "direct_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "direct_payments" ADD CONSTRAINT "direct_payments_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_payments" ADD CONSTRAINT "direct_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_payments" ADD CONSTRAINT "direct_payments_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direct_payments_deal_id_idx" ON "direct_payments" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "direct_payments_recorded_by_idx" ON "direct_payments" USING btree ("recorded_by");--> statement-breakpoint
CREATE INDEX "direct_payments_confirmed_by_idx" ON "direct_payments" USING btree ("confirmed_by");--> statement-breakpoint
CREATE UNIQUE INDEX "direct_payments_one_live_per_stage_idx" ON "direct_payments" USING btree ("deal_id","stage") WHERE "direct_payments"."disputed_at" is null;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_direct_payment_id_direct_payments_id_fk" FOREIGN KEY ("direct_payment_id") REFERENCES "public"."direct_payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_direct_payment_id_unique_idx" ON "invoices" USING btree ("direct_payment_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_one_source_check" CHECK (("invoices"."payment_id" is not null) <> ("invoices"."direct_payment_id" is not null));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_kind_source_check" CHECK (("invoices"."kind" = 'COMMISSION_TAX_INVOICE') = ("invoices"."payment_id" is not null));--> statement-breakpoint
DROP TYPE "public"."transfer_status";--> statement-breakpoint
DROP TYPE "public"."transfer_type";