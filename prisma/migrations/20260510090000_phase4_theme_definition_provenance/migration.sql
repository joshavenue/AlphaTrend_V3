-- Phase 4 theme ontology provenance and activation lifecycle.

ALTER TYPE "ThemeDefinitionStatus" ADD VALUE IF NOT EXISTS 'CATALOG_LOADED';
ALTER TYPE "ThemeDefinitionStatus" ADD VALUE IF NOT EXISTS 'ACTIVE_UNSCANNED';
ALTER TYPE "ThemeDefinitionStatus" ADD VALUE IF NOT EXISTS 'ACTIVE_SCANNED';
ALTER TYPE "ThemeDefinitionStatus" ADD VALUE IF NOT EXISTS 'PAUSED_DATA_GAP';
ALTER TYPE "ThemeDefinitionStatus" ADD VALUE IF NOT EXISTS 'RETIRED';

ALTER TABLE "theme_definitions"
  ADD COLUMN "source_theme_code" TEXT,
  ADD COLUMN "default_dashboard_state" "DashboardState" NOT NULL DEFAULT 'INSUFFICIENT_EVIDENCE',
  ADD COLUMN "source_detail" JSONB;

CREATE UNIQUE INDEX "theme_definitions_source_theme_code_key"
  ON "theme_definitions"("source_theme_code");
