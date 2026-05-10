-- Phase 1 contract constraints that Prisma cannot fully express.

ALTER TABLE "evidence_ledger"
  ALTER COLUMN "reliability_score" TYPE DECIMAL(10,4),
  ALTER COLUMN "freshness_score" TYPE DECIMAL(10,4);

ALTER TABLE "evidence_ledger"
  ADD CONSTRAINT "evidence_ledger_payload_or_hash_check"
  CHECK ("payload_id" IS NOT NULL OR "source_payload_hash" IS NOT NULL);

ALTER TABLE "evidence_ledger"
  ADD CONSTRAINT "evidence_ledger_score_impact_reason_code_check"
  CHECK ("score_impact" IS NULL OR "reason_code" IS NOT NULL);

ALTER TABLE "theme_definitions"
  ADD CONSTRAINT "theme_definitions_direct_categories_nonempty_check"
  CHECK (
    "direct_beneficiary_categories" <> '[]'::jsonb
    AND "direct_beneficiary_categories" <> '{}'::jsonb
    AND "direct_beneficiary_categories" <> 'null'::jsonb
  );

ALTER TABLE "theme_definitions"
  ADD CONSTRAINT "theme_definitions_excluded_categories_nonempty_check"
  CHECK (
    "excluded_categories" <> '[]'::jsonb
    AND "excluded_categories" <> '{}'::jsonb
    AND "excluded_categories" <> 'null'::jsonb
  );

ALTER TABLE "theme_definitions"
  ADD CONSTRAINT "theme_definitions_required_economic_proof_nonempty_check"
  CHECK (
    "required_economic_proof" <> '[]'::jsonb
    AND "required_economic_proof" <> '{}'::jsonb
    AND "required_economic_proof" <> 'null'::jsonb
  );

ALTER TABLE "theme_definitions"
  ADD CONSTRAINT "theme_definitions_invalidation_rules_nonempty_check"
  CHECK (
    "invalidation_rules" <> '[]'::jsonb
    AND "invalidation_rules" <> '{}'::jsonb
    AND "invalidation_rules" <> 'null'::jsonb
  );

ALTER TABLE "theme_definitions"
  ADD CONSTRAINT "theme_definitions_seed_or_screen_source_check"
  CHECK (
    COALESCE("seed_etfs", 'null'::jsonb) NOT IN ('null'::jsonb, '[]'::jsonb, '{}'::jsonb)
    OR COALESCE("candidate_industries", 'null'::jsonb) NOT IN ('null'::jsonb, '[]'::jsonb, '{}'::jsonb)
    OR COALESCE("candidate_screener_rules", 'null'::jsonb) NOT IN ('null'::jsonb, '[]'::jsonb, '{}'::jsonb)
  );

CREATE UNIQUE INDEX "watchlist_items_active_unique_idx"
  ON "watchlist_items" (
    COALESCE("user_id", '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("theme_id", '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("security_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "watch_type"
  )
  WHERE "archived_at" IS NULL;
