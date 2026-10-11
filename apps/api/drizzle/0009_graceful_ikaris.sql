CREATE TYPE "public"."user_gender" AS ENUM('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "city" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "age" smallint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "age_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gender" "user_gender";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pitch" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "adult_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "instagram_username_set_at";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_age_check" CHECK (("users"."age" is null) = ("users"."age_recorded_at" is null) and ("users"."age" is null or "users"."age" between 18 and 99));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_pitch_check" CHECK ("users"."pitch" is null or char_length("users"."pitch") <= 1000);