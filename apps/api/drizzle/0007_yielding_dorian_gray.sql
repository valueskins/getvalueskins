ALTER TABLE "creator_payout_accounts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "creator_payout_accounts" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payout_vpa" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payout_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payout_vpa_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_payout_vpa_check" CHECK ("users"."payout_vpa" is null or "users"."payout_vpa" ~ '^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,32}$');--> statement-breakpoint
DROP TYPE "public"."payout_account_status";