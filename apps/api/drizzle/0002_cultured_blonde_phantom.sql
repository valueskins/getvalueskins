ALTER TABLE "users" ALTER COLUMN "ig_account_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "ig_token_encrypted" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "ig_token_expires_at" DROP NOT NULL;