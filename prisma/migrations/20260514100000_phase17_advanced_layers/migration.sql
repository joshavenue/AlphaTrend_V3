-- Phase 17 advanced layers: context-only T5 ownership/flow and T7 base-rate storage.

ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'OWNERSHIP_FLOW_SCORE';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'BASE_RATE_SCORE';

CREATE TABLE "ownership_snapshots" (
  "ownership_snapshot_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "theme_candidate_id" UUID,
  "theme_id" UUID,
  "security_id" UUID NOT NULL,
  "provider" "ProviderName" NOT NULL DEFAULT 'FMP',
  "report_date" DATE,
  "holder_count" INTEGER,
  "total_shares" DECIMAL(28, 4),
  "total_market_value" DECIMAL(28, 4),
  "ownership_percent" DECIMAL(18, 8),
  "ownership_trend" TEXT,
  "delayed_data" BOOLEAN NOT NULL DEFAULT TRUE,
  "payload_id" UUID,
  "source_payload_hash" TEXT,
  "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "algorithm_version" TEXT NOT NULL,
  "job_run_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ownership_snapshots_pkey" PRIMARY KEY ("ownership_snapshot_id"),
  CONSTRAINT "ownership_snapshots_job_run_id_fkey" FOREIGN KEY ("job_run_id") REFERENCES "job_runs"("job_run_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ownership_snapshots_payload_id_fkey" FOREIGN KEY ("payload_id") REFERENCES "provider_payloads"("payload_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ownership_snapshots_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("security_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ownership_snapshots_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme_definitions"("theme_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ownership_snapshots_theme_candidate_id_fkey" FOREIGN KEY ("theme_candidate_id") REFERENCES "theme_candidates"("theme_candidate_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ownership_snapshots_security_report_idx"
  ON "ownership_snapshots"("security_id", "report_date");
CREATE INDEX "ownership_snapshots_candidate_fetched_idx"
  ON "ownership_snapshots"("theme_candidate_id", "fetched_at");
CREATE INDEX "ownership_snapshots_provider_fetched_idx"
  ON "ownership_snapshots"("provider", "fetched_at");
CREATE INDEX "ownership_snapshots_job_run_id_idx"
  ON "ownership_snapshots"("job_run_id");
CREATE INDEX "ownership_snapshots_payload_id_idx"
  ON "ownership_snapshots"("payload_id");

CREATE TABLE "etf_flow_snapshots" (
  "etf_flow_snapshot_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "theme_id" UUID NOT NULL,
  "theme_candidate_id" UUID,
  "security_id" UUID,
  "provider" "ProviderName" NOT NULL DEFAULT 'FMP',
  "etf_ticker" TEXT NOT NULL,
  "holding_ticker" TEXT,
  "holding_weight" DECIMAL(18, 8),
  "market_value" DECIMAL(28, 4),
  "shares" DECIMAL(28, 4),
  "as_of_date" DATE,
  "flow_eligible" BOOLEAN NOT NULL DEFAULT FALSE,
  "license_restricted" BOOLEAN NOT NULL DEFAULT FALSE,
  "payload_id" UUID,
  "source_payload_hash" TEXT,
  "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "algorithm_version" TEXT NOT NULL,
  "job_run_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "etf_flow_snapshots_pkey" PRIMARY KEY ("etf_flow_snapshot_id"),
  CONSTRAINT "etf_flow_snapshots_job_run_id_fkey" FOREIGN KEY ("job_run_id") REFERENCES "job_runs"("job_run_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "etf_flow_snapshots_payload_id_fkey" FOREIGN KEY ("payload_id") REFERENCES "provider_payloads"("payload_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "etf_flow_snapshots_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("security_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "etf_flow_snapshots_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme_definitions"("theme_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "etf_flow_snapshots_theme_candidate_id_fkey" FOREIGN KEY ("theme_candidate_id") REFERENCES "theme_candidates"("theme_candidate_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "etf_flow_snapshots_theme_etf_date_idx"
  ON "etf_flow_snapshots"("theme_id", "etf_ticker", "as_of_date");
CREATE INDEX "etf_flow_snapshots_security_fetched_idx"
  ON "etf_flow_snapshots"("security_id", "fetched_at");
CREATE INDEX "etf_flow_snapshots_candidate_fetched_idx"
  ON "etf_flow_snapshots"("theme_candidate_id", "fetched_at");
CREATE INDEX "etf_flow_snapshots_job_run_id_idx"
  ON "etf_flow_snapshots"("job_run_id");
CREATE INDEX "etf_flow_snapshots_payload_id_idx"
  ON "etf_flow_snapshots"("payload_id");

CREATE TABLE "base_rate_results" (
  "base_rate_result_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "theme_candidate_id" UUID NOT NULL,
  "theme_id" UUID NOT NULL,
  "security_id" UUID NOT NULL,
  "setup_key" TEXT NOT NULL,
  "sample_size" INTEGER NOT NULL DEFAULT 0,
  "median_return_1m" DECIMAL(18, 8),
  "median_return_3m" DECIMAL(18, 8),
  "median_return_6m" DECIMAL(18, 8),
  "win_rate_1m" DECIMAL(18, 8),
  "win_rate_3m" DECIMAL(18, 8),
  "win_rate_6m" DECIMAL(18, 8),
  "median_drawdown" DECIMAL(18, 8),
  "worst_decile_drawdown" DECIMAL(18, 8),
  "state" "BaseRateState" NOT NULL,
  "score" DECIMAL(10, 4),
  "reason_codes" JSONB,
  "evidence_ids" JSONB,
  "algorithm_version" TEXT NOT NULL,
  "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "job_run_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "base_rate_results_pkey" PRIMARY KEY ("base_rate_result_id"),
  CONSTRAINT "base_rate_results_job_run_id_fkey" FOREIGN KEY ("job_run_id") REFERENCES "job_runs"("job_run_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "base_rate_results_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("security_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "base_rate_results_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme_definitions"("theme_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "base_rate_results_theme_candidate_id_fkey" FOREIGN KEY ("theme_candidate_id") REFERENCES "theme_candidates"("theme_candidate_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "base_rate_results_candidate_computed_idx"
  ON "base_rate_results"("theme_candidate_id", "computed_at");
CREATE INDEX "base_rate_results_theme_state_computed_idx"
  ON "base_rate_results"("theme_id", "state", "computed_at");
CREATE INDEX "base_rate_results_security_setup_idx"
  ON "base_rate_results"("security_id", "setup_key");
CREATE INDEX "base_rate_results_job_run_id_idx"
  ON "base_rate_results"("job_run_id");
