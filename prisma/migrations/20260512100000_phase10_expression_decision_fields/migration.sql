ALTER TABLE "theme_candidates"
  ADD COLUMN "ticker_review_priority_score" DECIMAL(10,4),
  ADD COLUMN "rejection_reason_codes" JSONB,
  ADD COLUMN "top_pass_reason" TEXT,
  ADD COLUMN "top_fail_reason" TEXT;

CREATE INDEX "theme_candidates_review_priority_idx"
  ON "theme_candidates"("ticker_review_priority_score");
