-- One open dispute per deal. Before the index exists, keep the newest open dispute of each deal
-- (ids are UUID v7, so the largest is the newest) and close the others with a note.
UPDATE "disputes"
SET "status" = 'RESOLVED',
    "resolution" = 'Closed automatically when one open dispute per deal became the rule.',
    "resolved_at" = now()
WHERE "status" = 'OPEN'
  AND "id" NOT IN (
    SELECT DISTINCT ON ("deal_id") "id" FROM "disputes" WHERE "status" = 'OPEN' ORDER BY "deal_id", "id" DESC
  );--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_one_open_per_deal_idx" ON "disputes" USING btree ("deal_id") WHERE "disputes"."status" = 'OPEN';