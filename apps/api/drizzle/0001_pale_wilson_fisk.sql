CREATE TABLE "email_login_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"code_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limiter_points" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"expire" bigint
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_unique";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "instagram_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "manual_reference" text;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "manual_by_id" uuid;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "manual_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "email_login_codes_email_idx" ON "email_login_codes" USING btree ("email");--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_manual_by_id_users_id_fk" FOREIGN KEY ("manual_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique_idx" ON "users" USING btree ("username") WHERE "users"."instagram_user_id" is not null;--> statement-breakpoint
CREATE INDEX "transfers_manual_by_id_idx" ON "transfers" USING btree ("manual_by_id");