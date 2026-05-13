-- Phase 14 T2 economic demand proof support tables.

ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'ECONOMIC_DEMAND_FETCH';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'ECONOMIC_DEMAND_SCORE';

CREATE TABLE "economic_series" (
  "economic_series_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" "ProviderName" NOT NULL,
  "endpoint" TEXT NOT NULL,
  "series_id" TEXT NOT NULL,
  "title" TEXT,
  "description" TEXT,
  "frequency" TEXT,
  "unit" TEXT,
  "evidence_grade_ceiling" "EvidenceGrade" NOT NULL DEFAULT 'B',
  "freshness_threshold_days" INTEGER NOT NULL DEFAULT 90,
  "source_payload_hash" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "economic_series_pkey" PRIMARY KEY ("economic_series_id")
);

CREATE UNIQUE INDEX "economic_series_provider_endpoint_series_key"
  ON "economic_series"("provider", "endpoint", "series_id");
CREATE INDEX "economic_series_provider_endpoint_idx"
  ON "economic_series"("provider", "endpoint");
CREATE INDEX "economic_series_series_id_idx"
  ON "economic_series"("series_id");

CREATE TABLE "economic_observations" (
  "economic_observation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "economic_series_id" UUID NOT NULL,
  "provider" "ProviderName" NOT NULL,
  "observation_date" DATE NOT NULL,
  "period_label" TEXT,
  "metric_name" TEXT NOT NULL,
  "metric_value" DECIMAL(28, 8),
  "metric_unit" TEXT,
  "payload_id" UUID,
  "source_payload_hash" TEXT,
  "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "economic_observations_pkey" PRIMARY KEY ("economic_observation_id"),
  CONSTRAINT "economic_observations_economic_series_id_fkey" FOREIGN KEY ("economic_series_id") REFERENCES "economic_series"("economic_series_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "economic_observations_payload_id_fkey" FOREIGN KEY ("payload_id") REFERENCES "provider_payloads"("payload_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "economic_observations_series_date_metric_key"
  ON "economic_observations"("economic_series_id", "observation_date", "metric_name");
CREATE INDEX "economic_observations_provider_fetched_at_idx"
  ON "economic_observations"("provider", "fetched_at");
CREATE INDEX "economic_observations_observation_date_idx"
  ON "economic_observations"("observation_date");
CREATE INDEX "economic_observations_payload_id_idx"
  ON "economic_observations"("payload_id");

CREATE TABLE "theme_economic_mappings" (
  "theme_economic_mapping_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "theme_id" UUID NOT NULL,
  "economic_series_id" UUID,
  "feed_id" TEXT NOT NULL,
  "provider" "ProviderName" NOT NULL,
  "endpoint" TEXT NOT NULL,
  "series_or_query_id" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "proof_category" TEXT NOT NULL,
  "evidence_grade_ceiling" "EvidenceGrade" NOT NULL DEFAULT 'B',
  "frequency" TEXT,
  "freshness_threshold_days" INTEGER NOT NULL DEFAULT 90,
  "maps_to_theme" BOOLEAN NOT NULL DEFAULT TRUE,
  "maps_to_security" BOOLEAN NOT NULL DEFAULT FALSE,
  "mapping_method" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "theme_economic_mappings_pkey" PRIMARY KEY ("theme_economic_mapping_id"),
  CONSTRAINT "theme_economic_mappings_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme_definitions"("theme_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "theme_economic_mappings_economic_series_id_fkey" FOREIGN KEY ("economic_series_id") REFERENCES "economic_series"("economic_series_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "theme_economic_mappings_theme_feed_key"
  ON "theme_economic_mappings"("theme_id", "feed_id");
CREATE INDEX "theme_economic_mappings_provider_enabled_idx"
  ON "theme_economic_mappings"("provider", "enabled");
CREATE INDEX "theme_economic_mappings_series_id_idx"
  ON "theme_economic_mappings"("economic_series_id");

CREATE TABLE "government_awards" (
  "government_award_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "theme_id" UUID,
  "mapped_security_id" UUID,
  "provider" "ProviderName" NOT NULL DEFAULT 'USA_SPENDING',
  "award_id" TEXT,
  "recipient_name" TEXT,
  "recipient_uei" TEXT,
  "recipient_duns" TEXT,
  "award_amount" DECIMAL(28, 4),
  "awarding_agency" TEXT,
  "funding_agency" TEXT,
  "award_type" TEXT,
  "start_date" DATE,
  "end_date" DATE,
  "description" TEXT,
  "mapping_confidence" "IdentifierConfidence",
  "mapping_method" TEXT,
  "payload_id" UUID,
  "source_payload_hash" TEXT,
  "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "government_awards_pkey" PRIMARY KEY ("government_award_id"),
  CONSTRAINT "government_awards_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme_definitions"("theme_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "government_awards_mapped_security_id_fkey" FOREIGN KEY ("mapped_security_id") REFERENCES "securities"("security_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "government_awards_payload_id_fkey" FOREIGN KEY ("payload_id") REFERENCES "provider_payloads"("payload_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "government_awards_provider_award_key"
  ON "government_awards"("provider", "award_id");
CREATE INDEX "government_awards_theme_fetched_at_idx"
  ON "government_awards"("theme_id", "fetched_at");
CREATE INDEX "government_awards_mapped_security_idx"
  ON "government_awards"("mapped_security_id");
CREATE INDEX "government_awards_recipient_name_idx"
  ON "government_awards"("recipient_name");
CREATE INDEX "government_awards_payload_id_idx"
  ON "government_awards"("payload_id");

CREATE TABLE "recipient_security_mappings" (
  "recipient_security_mapping_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" "ProviderName" NOT NULL DEFAULT 'USA_SPENDING',
  "recipient_name" TEXT NOT NULL,
  "recipient_identifier" TEXT,
  "security_id" UUID,
  "confidence" "IdentifierConfidence" NOT NULL DEFAULT 'REVIEW_REQUIRED',
  "mapping_method" TEXT NOT NULL DEFAULT 'unmapped',
  "review_status" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
  "notes" TEXT,
  "source_detail" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "recipient_security_mappings_pkey" PRIMARY KEY ("recipient_security_mapping_id"),
  CONSTRAINT "recipient_security_mappings_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("security_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "recipient_security_mappings_provider_name_security_key"
  ON "recipient_security_mappings"("provider", "recipient_name", "security_id");
CREATE INDEX "recipient_security_mappings_recipient_name_idx"
  ON "recipient_security_mappings"("recipient_name");
CREATE INDEX "recipient_security_mappings_security_id_idx"
  ON "recipient_security_mappings"("security_id");
