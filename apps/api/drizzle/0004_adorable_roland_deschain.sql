ALTER TABLE "deals" ALTER COLUMN "title" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "application_deadline" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "content_upload_deadline" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "deal_deadline" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_published_fields_check" CHECK ("deals"."status" = 'DRAFT' or (
        "deals"."title" is not null and "deals"."description" is not null
        and "deals"."application_deadline" is not null and "deals"."content_upload_deadline" is not null
        and "deals"."deal_deadline" is not null and "deals"."budget_paise" is not null
        and "deals"."commission_base_paise" is not null and "deals"."commission_gst_paise" is not null
        and "deals"."commission_total_paise" is not null and "deals"."creator_amount_paise" is not null
        and "deals"."advance_paise" is not null and "deals"."final_paise" is not null
      ));