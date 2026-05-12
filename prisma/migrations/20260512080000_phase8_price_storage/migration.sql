-- Phase 8 price, valuation, and participation support tables.

CREATE TABLE "price_bars_daily" (
  "price_bar_daily_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "security_id" UUID NOT NULL,
  "ticker" TEXT NOT NULL,
  "bar_date" DATE NOT NULL,
  "open" DECIMAL(28, 8) NOT NULL,
  "high" DECIMAL(28, 8) NOT NULL,
  "low" DECIMAL(28, 8) NOT NULL,
  "close" DECIMAL(28, 8) NOT NULL,
  "volume" DECIMAL(28, 4) NOT NULL,
  "vwap" DECIMAL(28, 8),
  "transactions" INTEGER,
  "adjusted" BOOLEAN NOT NULL DEFAULT TRUE,
  "provider" "ProviderName" NOT NULL,
  "payload_id" UUID,
  "source_payload_hash" TEXT,
  "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "price_bars_daily_pkey" PRIMARY KEY ("price_bar_daily_id"),
  CONSTRAINT "price_bars_daily_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("security_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "price_bars_daily_payload_id_fkey" FOREIGN KEY ("payload_id") REFERENCES "provider_payloads"("payload_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "price_bars_daily_security_date_provider_adjusted_key"
  ON "price_bars_daily"("security_id", "bar_date", "provider", "adjusted");
CREATE INDEX "price_bars_daily_ticker_date_idx"
  ON "price_bars_daily"("ticker", "bar_date");
CREATE INDEX "price_bars_daily_provider_fetched_at_idx"
  ON "price_bars_daily"("provider", "fetched_at");
CREATE INDEX "price_bars_daily_payload_id_idx"
  ON "price_bars_daily"("payload_id");

CREATE TABLE "price_metrics_daily" (
  "price_metric_daily_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "security_id" UUID NOT NULL,
  "metric_date" DATE NOT NULL,
  "latest_close" DECIMAL(28, 8),
  "ma_20" DECIMAL(28, 8),
  "ma_50" DECIMAL(28, 8),
  "ma_200" DECIMAL(28, 8),
  "ma_20_slope" DECIMAL(18, 8),
  "ma_50_slope" DECIMAL(18, 8),
  "ma_200_slope" DECIMAL(18, 8),
  "atr_14" DECIMAL(28, 8),
  "high_52w" DECIMAL(28, 8),
  "low_52w" DECIMAL(28, 8),
  "distance_from_20d_atr" DECIMAL(18, 8),
  "distance_from_50d_atr" DECIMAL(18, 8),
  "return_1m" DECIMAL(18, 8),
  "return_3m" DECIMAL(18, 8),
  "return_6m" DECIMAL(18, 8),
  "drawdown_from_52w_high" DECIMAL(18, 8),
  "average_volume_20d" DECIMAL(28, 4),
  "average_dollar_volume_20d" DECIMAL(28, 4),
  "volume_zscore_20d" DECIMAL(18, 8),
  "up_volume_ratio_20d" DECIMAL(18, 8),
  "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "algorithm_version" TEXT NOT NULL,

  CONSTRAINT "price_metrics_daily_pkey" PRIMARY KEY ("price_metric_daily_id"),
  CONSTRAINT "price_metrics_daily_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("security_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "price_metrics_daily_security_date_algorithm_key"
  ON "price_metrics_daily"("security_id", "metric_date", "algorithm_version");
CREATE INDEX "price_metrics_daily_metric_date_idx"
  ON "price_metrics_daily"("metric_date");
CREATE INDEX "price_metrics_daily_security_computed_at_idx"
  ON "price_metrics_daily"("security_id", "computed_at");

CREATE TABLE "theme_basket_prices" (
  "theme_basket_price_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "theme_id" UUID NOT NULL,
  "basket_date" DATE NOT NULL,
  "member_count" INTEGER NOT NULL,
  "return_1m" DECIMAL(18, 8),
  "return_3m" DECIMAL(18, 8),
  "benchmark_ticker" TEXT,
  "method" TEXT NOT NULL,
  "algorithm_version" TEXT NOT NULL,
  "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "theme_basket_prices_pkey" PRIMARY KEY ("theme_basket_price_id"),
  CONSTRAINT "theme_basket_prices_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme_definitions"("theme_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "theme_basket_prices_theme_date_algorithm_key"
  ON "theme_basket_prices"("theme_id", "basket_date", "algorithm_version");
CREATE INDEX "theme_basket_prices_theme_computed_at_idx"
  ON "theme_basket_prices"("theme_id", "computed_at");
