-- CreateEnum
CREATE TYPE "ProviderName" AS ENUM ('SEC', 'NASDAQ_TRADER', 'MASSIVE', 'FMP', 'OPENFIGI', 'ALPHA_VANTAGE', 'FRED', 'BEA', 'BLS', 'EIA', 'USA_SPENDING', 'USPTO');

-- CreateEnum
CREATE TYPE "SecurityType" AS ENUM ('COMMON_STOCK', 'ADR', 'ETF', 'ETN', 'CLOSED_END_FUND', 'PREFERRED', 'WARRANT', 'RIGHT', 'UNIT', 'SPAC_UNIT', 'INDEX', 'FUND', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "UniverseBucket" AS ENUM ('US_COMMON_ALL', 'US_COMMON_LIQUID', 'US_COMMON_CORE', 'US_MICROCAP_SPECULATIVE', 'US_ETF_ALL', 'US_ADR_ALL', 'US_DELISTED_HISTORY', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('ACTIVE', 'REJECTED', 'WATCH_ONLY', 'NO_TRADE', 'INACTIVE', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "BeneficiaryType" AS ENUM ('DIRECT_BENEFICIARY', 'MAJOR_BENEFICIARY', 'PARTIAL_BENEFICIARY', 'INDIRECT_BENEFICIARY', 'NARRATIVE_ADJACENT', 'SAME_SECTOR_ONLY', 'UNRELATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FundamentalState" AS ENUM ('VALIDATED', 'IMPROVING', 'NOT_YET_VALIDATED', 'DETERIORATING', 'CONTRADICTED', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "PriceState" AS ENUM ('NEUTRAL', 'IMPROVING', 'PARTICIPANT', 'LEADER', 'LEADER_BUT_EXTENDED', 'DELAYED_CATCH_UP_CANDIDATE', 'NON_PARTICIPANT', 'PRICE_OUTRAN_EVIDENCE', 'NEEDS_CONSOLIDATION', 'BROKEN', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "LiquidityState" AS ENUM ('CORE_ELIGIBLE', 'EXPANDED_ELIGIBLE', 'SPECULATIVE_ONLY', 'ILLIQUID', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "DilutionRiskState" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'SEVERE', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "FlowState" AS ENUM ('NOT_BUILT_MVP_PLACEHOLDER', 'ETF_FLOW_ELIGIBLE', 'BROADENING_OWNERSHIP', 'INSTITUTIONAL_ACCUMULATION', 'CROWDED_OWNERSHIP', 'DISTRIBUTION_OR_TRIMMING', 'NO_MEANINGFUL_FLOW_ACCESS', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "BaseRateState" AS ENUM ('NOT_BUILT_MVP_PLACEHOLDER', 'SUPPORTIVE', 'MIXED', 'UNFAVORABLE', 'LOW_SAMPLE_WARNING', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "FinalState" AS ENUM ('SINGLE_STOCK_RESEARCH_JUSTIFIED', 'BASKET_PREFERRED', 'ETF_PREFERRED', 'WATCHLIST_ONLY', 'LEADER_BUT_EXTENDED', 'DELAYED_CATCH_UP_CANDIDATE', 'NON_PARTICIPANT', 'WRONG_TICKER', 'NO_TRADE', 'REJECTED', 'INVALIDATED', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "DashboardState" AS ENUM ('WORTH_CHECKING_OUT', 'EARLY_WATCHLIST', 'CONFIRMED_BUT_EXTENDED', 'CROWDED_LATE', 'FADING', 'INSUFFICIENT_EVIDENCE', 'NO_CLEAN_EXPRESSION', 'REJECTED_INACTIVE');

-- CreateEnum
CREATE TYPE "SignalLayer" AS ENUM ('T1_EXPOSURE_PURITY', 'T2_ECONOMIC_DEMAND', 'T3_FUNDAMENTALS', 'T4_PRICE_VALUATION_PARTICIPATION', 'T5_OWNERSHIP_FLOW', 'T6_LIQUIDITY_DILUTION_FRAGILITY', 'T7_BASE_RATE', 'T8_EXPRESSION_DECISION');

-- CreateEnum
CREATE TYPE "EvidenceGrade" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "PayloadRedactionStatus" AS ENUM ('NO_SECRETS_DETECTED', 'REDACTED', 'FAILED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ThemeDefinitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('PROVIDER_SMOKE', 'SECURITY_MASTER_REFRESH', 'THEME_CANDIDATE_GENERATION', 'PRICE_BACKFILL', 'FUNDAMENTAL_BACKFILL', 'THEME_SCAN', 'THEME_SNAPSHOT', 'ALERT_GENERATION', 'BACKFILL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'PARTIAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobItemStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'POSITIVE', 'CAUTION', 'WARNING', 'BLOCKER');

-- CreateEnum
CREATE TYPE "AlertDeliveryStatus" AS ENUM ('STORED', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "WatchType" AS ENUM ('THEME', 'TICKER_THEME_PAIR', 'TICKER_GLOBAL');

-- CreateEnum
CREATE TYPE "WatchlistStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AuthRole" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "AuthAuditEventType" AS ENUM ('ADMIN_CREATED', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'SESSION_REVOKED', 'ADMIN_JOB_TRIGGERED');

-- CreateEnum
CREATE TYPE "IdentifierConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "securities" (
    "security_id" UUID NOT NULL,
    "canonical_ticker" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "exchange" TEXT,
    "mic" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "security_type" "SecurityType" NOT NULL,
    "universe_bucket" "UniverseBucket",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_test_issue" BOOLEAN NOT NULL DEFAULT false,
    "is_etf" BOOLEAN NOT NULL DEFAULT false,
    "is_adr" BOOLEAN NOT NULL DEFAULT false,
    "is_delisted" BOOLEAN NOT NULL DEFAULT false,
    "cik" TEXT,
    "figi" TEXT,
    "composite_figi" TEXT,
    "share_class_figi" TEXT,
    "listing_date" DATE,
    "delisting_date" DATE,
    "last_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "securities_pkey" PRIMARY KEY ("security_id")
);

-- CreateTable
CREATE TABLE "security_identifiers" (
    "security_identifier_id" UUID NOT NULL,
    "security_id" UUID NOT NULL,
    "provider" "ProviderName" NOT NULL,
    "identifier_type" TEXT NOT NULL,
    "identifier_value" TEXT NOT NULL,
    "valid_from" DATE,
    "valid_to" DATE,
    "confidence" "IdentifierConfidence",
    "source_payload_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_identifiers_pkey" PRIMARY KEY ("security_identifier_id")
);

-- CreateTable
CREATE TABLE "provider_payloads" (
    "payload_id" UUID NOT NULL,
    "provider" "ProviderName" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "request_hash" TEXT NOT NULL,
    "response_hash" TEXT NOT NULL,
    "payload_storage_uri" TEXT,
    "payload_preview_json" JSONB,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "http_status" INTEGER,
    "content_type" TEXT,
    "size_bytes" INTEGER,
    "redaction_status" "PayloadRedactionStatus" NOT NULL DEFAULT 'REDACTED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_payloads_pkey" PRIMARY KEY ("payload_id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "job_run_id" UUID NOT NULL,
    "job_type" "JobType" NOT NULL,
    "scope_type" TEXT,
    "scope_id" TEXT,
    "status" "JobStatus" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "rows_read" INTEGER NOT NULL DEFAULT 0,
    "rows_written" INTEGER NOT NULL DEFAULT 0,
    "provider_calls" INTEGER NOT NULL DEFAULT 0,
    "error_summary" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("job_run_id")
);

-- CreateTable
CREATE TABLE "api_observability" (
    "api_call_id" UUID NOT NULL,
    "job_run_id" UUID,
    "provider" "ProviderName" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "request_hash" TEXT,
    "status_code" INTEGER,
    "duration_ms" INTEGER,
    "row_count" INTEGER,
    "response_hash" TEXT,
    "payload_id" UUID,
    "sanitized_error" TEXT,
    "called_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_observability_pkey" PRIMARY KEY ("api_call_id")
);

-- CreateTable
CREATE TABLE "theme_definitions" (
    "theme_id" UUID NOT NULL,
    "theme_slug" TEXT NOT NULL,
    "theme_name" TEXT NOT NULL,
    "short_description" TEXT,
    "economic_mechanism" JSONB NOT NULL,
    "primary_demand_drivers" JSONB NOT NULL,
    "supply_constraints" JSONB,
    "pricing_power_points" JSONB,
    "direct_beneficiary_categories" JSONB NOT NULL,
    "indirect_beneficiary_categories" JSONB NOT NULL,
    "excluded_categories" JSONB NOT NULL,
    "seed_etfs" JSONB,
    "candidate_industries" JSONB,
    "candidate_screener_rules" JSONB,
    "required_economic_proof" JSONB NOT NULL,
    "required_fundamental_proof" JSONB NOT NULL,
    "price_confirmation_rules" JSONB,
    "valuation_risk_rules" JSONB,
    "liquidity_rules" JSONB,
    "invalidation_rules" JSONB NOT NULL,
    "status" "ThemeDefinitionStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "theme_definitions_pkey" PRIMARY KEY ("theme_id")
);

-- CreateTable
CREATE TABLE "theme_candidates" (
    "theme_candidate_id" UUID NOT NULL,
    "theme_id" UUID NOT NULL,
    "security_id" UUID NOT NULL,
    "candidate_status" "CandidateStatus" NOT NULL,
    "beneficiary_type" "BeneficiaryType",
    "final_state" "FinalState",
    "source_of_inclusion" TEXT NOT NULL,
    "source_detail" JSONB,
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3),
    "last_scanned_at" TIMESTAMPTZ(3),
    "display_group" TEXT,
    "dashboard_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "theme_candidates_pkey" PRIMARY KEY ("theme_candidate_id")
);

-- CreateTable
CREATE TABLE "evidence_ledger" (
    "evidence_id" UUID NOT NULL,
    "job_run_id" UUID,
    "theme_id" UUID,
    "security_id" UUID,
    "provider" "ProviderName" NOT NULL,
    "endpoint" TEXT,
    "payload_id" UUID,
    "source_url_or_endpoint" TEXT,
    "source_payload_hash" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metric_name" TEXT NOT NULL,
    "metric_value_text" TEXT,
    "metric_value_num" DECIMAL(28,8),
    "metric_unit" TEXT,
    "period_start" DATE,
    "period_end" DATE,
    "as_of_date" DATE,
    "observed_at" TIMESTAMPTZ(3),
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidence_grade" "EvidenceGrade",
    "reliability_score" DECIMAL(6,4),
    "freshness_score" DECIMAL(6,4),
    "reason_code" TEXT,
    "score_impact" DECIMAL(10,4),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_ledger_pkey" PRIMARY KEY ("evidence_id")
);

-- CreateTable
CREATE TABLE "candidate_signal_scores" (
    "candidate_signal_score_id" UUID NOT NULL,
    "theme_candidate_id" UUID NOT NULL,
    "signal_layer" "SignalLayer" NOT NULL,
    "score" DECIMAL(10,4),
    "max_score" DECIMAL(10,4) NOT NULL DEFAULT 100,
    "score_version" TEXT NOT NULL,
    "evidence_ids" JSONB,
    "reason_codes" JSONB,
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job_run_id" UUID,

    CONSTRAINT "candidate_signal_scores_pkey" PRIMARY KEY ("candidate_signal_score_id")
);

-- CreateTable
CREATE TABLE "candidate_signal_states" (
    "candidate_signal_state_id" UUID NOT NULL,
    "theme_candidate_id" UUID NOT NULL,
    "signal_layer" "SignalLayer" NOT NULL,
    "state" TEXT NOT NULL,
    "state_version" TEXT NOT NULL,
    "reason_codes" JSONB,
    "evidence_ids" JSONB,
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job_run_id" UUID,

    CONSTRAINT "candidate_signal_states_pkey" PRIMARY KEY ("candidate_signal_state_id")
);

-- CreateTable
CREATE TABLE "theme_snapshots" (
    "theme_snapshot_id" UUID NOT NULL,
    "theme_id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "dashboard_state" "DashboardState" NOT NULL,
    "theme_review_priority_score" DECIMAL(10,4),
    "theme_reality_score" DECIMAL(10,4),
    "direct_beneficiary_count" INTEGER NOT NULL DEFAULT 0,
    "investable_candidate_count" INTEGER NOT NULL DEFAULT 0,
    "leader_count" INTEGER NOT NULL DEFAULT 0,
    "leader_but_extended_count" INTEGER NOT NULL DEFAULT 0,
    "delayed_catchup_count" INTEGER NOT NULL DEFAULT 0,
    "watchlist_only_count" INTEGER NOT NULL DEFAULT 0,
    "wrong_ticker_count" INTEGER NOT NULL DEFAULT 0,
    "no_trade_count" INTEGER NOT NULL DEFAULT 0,
    "basket_preferred" BOOLEAN NOT NULL DEFAULT false,
    "etf_preferred" BOOLEAN NOT NULL DEFAULT false,
    "highlight_reason_codes" JSONB,
    "caution_reason_codes" JSONB,
    "top_direct_beneficiaries" JSONB,
    "top_rejected_tickers" JSONB,
    "data_quality_score" DECIMAL(10,4),
    "last_scanned_at" TIMESTAMPTZ(3),
    "job_run_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "theme_snapshots_pkey" PRIMARY KEY ("theme_snapshot_id")
);

-- CreateTable
CREATE TABLE "signal_states" (
    "signal_state_id" UUID NOT NULL,
    "theme_id" UUID NOT NULL,
    "security_id" UUID,
    "theme_candidate_id" UUID,
    "state_type" TEXT NOT NULL,
    "previous_state" TEXT,
    "current_state" TEXT NOT NULL,
    "previous_score" DECIMAL(10,4),
    "current_score" DECIMAL(10,4),
    "state_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cooldown_until" TIMESTAMPTZ(3),
    "severity" "AlertSeverity",
    "reason_codes" JSONB,
    "evidence_ids" JSONB,
    "job_run_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signal_states_pkey" PRIMARY KEY ("signal_state_id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "alert_id" UUID NOT NULL,
    "signal_state_id" UUID,
    "theme_id" UUID,
    "security_id" UUID,
    "theme_candidate_id" UUID,
    "alert_type" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "reason_codes" JSONB,
    "delivery_channel" TEXT,
    "delivery_status" "AlertDeliveryStatus" NOT NULL DEFAULT 'STORED',
    "sent_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),
    "dismissed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("alert_id")
);

-- CreateTable
CREATE TABLE "watchlist_items" (
    "watchlist_item_id" UUID NOT NULL,
    "user_id" UUID,
    "theme_id" UUID,
    "security_id" UUID,
    "theme_candidate_id" UUID,
    "watch_type" "WatchType" NOT NULL,
    "status" "WatchlistStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_from_alert_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("watchlist_item_id")
);

-- CreateTable
CREATE TABLE "job_locks" (
    "lock_key" TEXT NOT NULL,
    "job_run_id" UUID,
    "locked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "heartbeat_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner_id" TEXT,

    CONSTRAINT "job_locks_pkey" PRIMARY KEY ("lock_key")
);

-- CreateTable
CREATE TABLE "job_items" (
    "job_item_id" UUID NOT NULL,
    "job_run_id" UUID NOT NULL,
    "item_type" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "status" "JobItemStatus" NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "error_summary" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_items_pkey" PRIMARY KEY ("job_item_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "AuthRole" NOT NULL DEFAULT 'ADMIN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "last_login_at" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3),
    "disabled_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "auth_audit_events" (
    "auth_audit_event_id" UUID NOT NULL,
    "event_type" "AuthAuditEventType" NOT NULL,
    "user_id" UUID,
    "email" TEXT,
    "ip_hash" TEXT,
    "user_agent_hash" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_audit_events_pkey" PRIMARY KEY ("auth_audit_event_id")
);

-- CreateIndex
CREATE INDEX "securities_canonical_ticker_idx" ON "securities"("canonical_ticker");

-- CreateIndex
CREATE INDEX "securities_cik_idx" ON "securities"("cik");

-- CreateIndex
CREATE INDEX "securities_figi_idx" ON "securities"("figi");

-- CreateIndex
CREATE INDEX "securities_security_type_idx" ON "securities"("security_type");

-- CreateIndex
CREATE INDEX "securities_is_active_idx" ON "securities"("is_active");

-- CreateIndex
CREATE INDEX "securities_is_etf_idx" ON "securities"("is_etf");

-- CreateIndex
CREATE INDEX "securities_is_adr_idx" ON "securities"("is_adr");

-- CreateIndex
CREATE UNIQUE INDEX "securities_canonical_ticker_exchange_key" ON "securities"("canonical_ticker", "exchange");

-- CreateIndex
CREATE UNIQUE INDEX "securities_figi_key" ON "securities"("figi");

-- CreateIndex
CREATE UNIQUE INDEX "securities_cik_canonical_ticker_key" ON "securities"("cik", "canonical_ticker");

-- CreateIndex
CREATE INDEX "security_identifiers_security_id_idx" ON "security_identifiers"("security_id");

-- CreateIndex
CREATE UNIQUE INDEX "security_identifiers_provider_type_value_key" ON "security_identifiers"("provider", "identifier_type", "identifier_value");

-- CreateIndex
CREATE INDEX "provider_payloads_provider_endpoint_response_hash_idx" ON "provider_payloads"("provider", "endpoint", "response_hash");

-- CreateIndex
CREATE INDEX "provider_payloads_response_hash_idx" ON "provider_payloads"("response_hash");

-- CreateIndex
CREATE INDEX "provider_payloads_fetched_at_idx" ON "provider_payloads"("fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "provider_payloads_provider_endpoint_hashes_key" ON "provider_payloads"("provider", "endpoint", "request_hash", "response_hash");

-- CreateIndex
CREATE INDEX "job_runs_type_status_started_at_idx" ON "job_runs"("job_type", "status", "started_at");

-- CreateIndex
CREATE INDEX "job_runs_scope_idx" ON "job_runs"("scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "api_observability_provider_endpoint_called_at_idx" ON "api_observability"("provider", "endpoint", "called_at");

-- CreateIndex
CREATE INDEX "api_observability_job_run_id_idx" ON "api_observability"("job_run_id");

-- CreateIndex
CREATE INDEX "api_observability_status_code_idx" ON "api_observability"("status_code");

-- CreateIndex
CREATE INDEX "api_observability_payload_id_idx" ON "api_observability"("payload_id");

-- CreateIndex
CREATE UNIQUE INDEX "theme_definitions_theme_slug_key" ON "theme_definitions"("theme_slug");

-- CreateIndex
CREATE UNIQUE INDEX "theme_definitions_theme_name_key" ON "theme_definitions"("theme_name");

-- CreateIndex
CREATE INDEX "theme_definitions_status_idx" ON "theme_definitions"("status");

-- CreateIndex
CREATE INDEX "theme_candidates_theme_security_idx" ON "theme_candidates"("theme_id", "security_id");

-- CreateIndex
CREATE INDEX "theme_candidates_candidate_status_idx" ON "theme_candidates"("candidate_status");

-- CreateIndex
CREATE INDEX "theme_candidates_final_state_idx" ON "theme_candidates"("final_state");

-- CreateIndex
CREATE UNIQUE INDEX "theme_candidates_theme_security_key" ON "theme_candidates"("theme_id", "security_id");

-- CreateIndex
CREATE INDEX "evidence_ledger_theme_security_idx" ON "evidence_ledger"("theme_id", "security_id");

-- CreateIndex
CREATE INDEX "evidence_ledger_provider_endpoint_idx" ON "evidence_ledger"("provider", "endpoint");

-- CreateIndex
CREATE INDEX "evidence_ledger_metric_name_idx" ON "evidence_ledger"("metric_name");

-- CreateIndex
CREATE INDEX "evidence_ledger_as_of_date_idx" ON "evidence_ledger"("as_of_date");

-- CreateIndex
CREATE INDEX "evidence_ledger_reason_code_idx" ON "evidence_ledger"("reason_code");

-- CreateIndex
CREATE INDEX "evidence_ledger_job_run_id_idx" ON "evidence_ledger"("job_run_id");

-- CreateIndex
CREATE INDEX "evidence_ledger_payload_id_idx" ON "evidence_ledger"("payload_id");

-- CreateIndex
CREATE INDEX "candidate_signal_scores_candidate_layer_time_idx" ON "candidate_signal_scores"("theme_candidate_id", "signal_layer", "computed_at");

-- CreateIndex
CREATE INDEX "candidate_signal_scores_job_run_id_idx" ON "candidate_signal_scores"("job_run_id");

-- CreateIndex
CREATE INDEX "candidate_signal_states_candidate_layer_time_idx" ON "candidate_signal_states"("theme_candidate_id", "signal_layer", "computed_at");

-- CreateIndex
CREATE INDEX "candidate_signal_states_job_run_id_idx" ON "candidate_signal_states"("job_run_id");

-- CreateIndex
CREATE INDEX "theme_snapshots_theme_date_idx" ON "theme_snapshots"("theme_id", "snapshot_date");

-- CreateIndex
CREATE INDEX "theme_snapshots_dashboard_state_idx" ON "theme_snapshots"("dashboard_state");

-- CreateIndex
CREATE INDEX "theme_snapshots_job_run_id_idx" ON "theme_snapshots"("job_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "theme_snapshots_theme_date_job_key" ON "theme_snapshots"("theme_id", "snapshot_date", "job_run_id");

-- CreateIndex
CREATE INDEX "signal_states_theme_security_type_changed_idx" ON "signal_states"("theme_id", "security_id", "state_type", "state_changed_at");

-- CreateIndex
CREATE INDEX "signal_states_cooldown_until_idx" ON "signal_states"("cooldown_until");

-- CreateIndex
CREATE INDEX "signal_states_theme_candidate_id_idx" ON "signal_states"("theme_candidate_id");

-- CreateIndex
CREATE INDEX "signal_states_job_run_id_idx" ON "signal_states"("job_run_id");

-- CreateIndex
CREATE INDEX "alerts_theme_security_type_idx" ON "alerts"("theme_id", "security_id", "alert_type");

-- CreateIndex
CREATE INDEX "alerts_delivery_status_idx" ON "alerts"("delivery_status");

-- CreateIndex
CREATE INDEX "alerts_read_dismissed_idx" ON "alerts"("read_at", "dismissed_at");

-- CreateIndex
CREATE INDEX "alerts_created_at_idx" ON "alerts"("created_at");

-- CreateIndex
CREATE INDEX "watchlist_items_user_id_idx" ON "watchlist_items"("user_id");

-- CreateIndex
CREATE INDEX "watchlist_items_theme_security_type_idx" ON "watchlist_items"("theme_id", "security_id", "watch_type");

-- CreateIndex
CREATE INDEX "watchlist_items_status_idx" ON "watchlist_items"("status");

-- CreateIndex
CREATE INDEX "job_locks_expires_at_idx" ON "job_locks"("expires_at");

-- CreateIndex
CREATE INDEX "job_locks_job_run_id_idx" ON "job_locks"("job_run_id");

-- CreateIndex
CREATE INDEX "job_items_job_run_status_idx" ON "job_items"("job_run_id", "status");

-- CreateIndex
CREATE INDEX "job_items_type_id_idx" ON "job_items"("item_type", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX "auth_audit_events_type_created_at_idx" ON "auth_audit_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "auth_audit_events_user_id_idx" ON "auth_audit_events"("user_id");

-- AddForeignKey
ALTER TABLE "security_identifiers" ADD CONSTRAINT "security_identifiers_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("security_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_observability" ADD CONSTRAINT "api_observability_job_run_id_fkey" FOREIGN KEY ("job_run_id") REFERENCES "job_runs"("job_run_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_observability" ADD CONSTRAINT "api_observability_payload_id_fkey" FOREIGN KEY ("payload_id") REFERENCES "provider_payloads"("payload_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theme_candidates" ADD CONSTRAINT "theme_candidates_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("security_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theme_candidates" ADD CONSTRAINT "theme_candidates_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme_definitions"("theme_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_ledger" ADD CONSTRAINT "evidence_ledger_job_run_id_fkey" FOREIGN KEY ("job_run_id") REFERENCES "job_runs"("job_run_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_ledger" ADD CONSTRAINT "evidence_ledger_payload_id_fkey" FOREIGN KEY ("payload_id") REFERENCES "provider_payloads"("payload_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_ledger" ADD CONSTRAINT "evidence_ledger_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("security_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_ledger" ADD CONSTRAINT "evidence_ledger_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme_definitions"("theme_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_signal_scores" ADD CONSTRAINT "candidate_signal_scores_job_run_id_fkey" FOREIGN KEY ("job_run_id") REFERENCES "job_runs"("job_run_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_signal_scores" ADD CONSTRAINT "candidate_signal_scores_theme_candidate_id_fkey" FOREIGN KEY ("theme_candidate_id") REFERENCES "theme_candidates"("theme_candidate_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_signal_states" ADD CONSTRAINT "candidate_signal_states_job_run_id_fkey" FOREIGN KEY ("job_run_id") REFERENCES "job_runs"("job_run_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_signal_states" ADD CONSTRAINT "candidate_signal_states_theme_candidate_id_fkey" FOREIGN KEY ("theme_candidate_id") REFERENCES "theme_candidates"("theme_candidate_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theme_snapshots" ADD CONSTRAINT "theme_snapshots_job_run_id_fkey" FOREIGN KEY ("job_run_id") REFERENCES "job_runs"("job_run_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theme_snapshots" ADD CONSTRAINT "theme_snapshots_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme_definitions"("theme_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_states" ADD CONSTRAINT "signal_states_job_run_id_fkey" FOREIGN KEY ("job_run_id") REFERENCES "job_runs"("job_run_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_states" ADD CONSTRAINT "signal_states_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("security_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_states" ADD CONSTRAINT "signal_states_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme_definitions"("theme_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_states" ADD CONSTRAINT "signal_states_theme_candidate_id_fkey" FOREIGN KEY ("theme_candidate_id") REFERENCES "theme_candidates"("theme_candidate_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("security_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_signal_state_id_fkey" FOREIGN KEY ("signal_state_id") REFERENCES "signal_states"("signal_state_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme_definitions"("theme_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_theme_candidate_id_fkey" FOREIGN KEY ("theme_candidate_id") REFERENCES "theme_candidates"("theme_candidate_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_created_from_alert_id_fkey" FOREIGN KEY ("created_from_alert_id") REFERENCES "alerts"("alert_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("security_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme_definitions"("theme_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_theme_candidate_id_fkey" FOREIGN KEY ("theme_candidate_id") REFERENCES "theme_candidates"("theme_candidate_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_locks" ADD CONSTRAINT "job_locks_job_run_id_fkey" FOREIGN KEY ("job_run_id") REFERENCES "job_runs"("job_run_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_items" ADD CONSTRAINT "job_items_job_run_id_fkey" FOREIGN KEY ("job_run_id") REFERENCES "job_runs"("job_run_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_audit_events" ADD CONSTRAINT "auth_audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
