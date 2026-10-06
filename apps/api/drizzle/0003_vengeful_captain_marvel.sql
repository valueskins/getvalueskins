ALTER TABLE "creator_payout_accounts" ALTER COLUMN "razorpay_stakeholder_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_payout_accounts" ALTER COLUMN "razorpay_product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_payout_accounts" ADD COLUMN "status_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "instagram_username_set_at" timestamp with time zone;