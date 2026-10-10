DROP INDEX "invoices_payment_id_idx";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "razorpay_fee_paise" bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "razorpay_tax_paise" bigint;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "razorpay_fee_paise" bigint;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "razorpay_tax_paise" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_payment_id_unique_idx" ON "invoices" USING btree ("payment_id");