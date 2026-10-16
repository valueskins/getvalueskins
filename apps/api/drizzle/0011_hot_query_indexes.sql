CREATE INDEX "deals_brand_id_id_idx" ON "deals" USING btree ("brand_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "deals_creator_id_id_idx" ON "deals" USING btree ("creator_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "deals_status_id_idx" ON "deals" USING btree ("status","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "deals_open_feed_idx" ON "deals" USING btree ("published_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "deals"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "deals_short_id_prefix_idx" ON "deals" USING btree ("short_id" varchar_pattern_ops);--> statement-breakpoint
DROP INDEX "deals_brand_id_idx";--> statement-breakpoint
DROP INDEX "deals_creator_id_idx";--> statement-breakpoint
DROP INDEX "deals_status_idx";
