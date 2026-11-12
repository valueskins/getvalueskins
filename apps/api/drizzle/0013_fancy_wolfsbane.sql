CREATE TYPE "public"."email_provider" AS ENUM('resend', 'brevo', 'console');--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "provider" "email_provider";