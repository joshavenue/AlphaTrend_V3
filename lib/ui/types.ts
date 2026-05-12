export type DashboardThemeRow = {
  default_dashboard_state: string;
  economic_mechanism_summary: string | null;
  short_description: string | null;
  snapshot: {
    basket_preferred: boolean;
    caution_reason_codes: string[];
    dashboard_state: string;
    data_quality_score: number | null;
    delayed_catchup_count: number;
    direct_beneficiary_count: number;
    etf_preferred: boolean;
    highlight_reason_codes: string[];
    investable_candidate_count: number;
    last_scanned_at: string | null;
    leader_but_extended_count: number;
    leader_count: number;
    no_trade_count: number;
    theme_reality_score: number | null;
    theme_review_priority_score: number | null;
    top_direct_beneficiaries: unknown[];
    top_rejected_tickers: unknown[];
    watchlist_only_count: number;
    wrong_ticker_count: number;
  } | null;
  source_theme_code: string | null;
  status: string;
  theme_id: string;
  theme_name: string;
  theme_slug: string;
};

export type SignalView = {
  computed_at: string;
  evidence_ids: string[];
  reason_codes: string[];
  score: number | null;
  state?: string | null;
} | null;

export type CandidateRow = {
  beneficiary_type: string | null;
  candidate_status: string;
  company_name: string;
  dashboard_visible: boolean;
  display_group: string | null;
  exchange: string | null;
  final_state: string | null;
  last_scanned_at: string | null;
  rejection_reason_codes: string[];
  review_priority_score: number | null;
  security_id: string;
  signal_scores: Record<string, SignalView>;
  signal_states: Record<string, SignalView>;
  source_of_inclusion: string;
  ticker: string;
  top_fail_reason: string | null;
  top_pass_reason: string | null;
  universe_bucket: string | null;
};

export type ThemeCandidatesView = {
  candidate_count: number;
  groups: Record<string, CandidateRow[]>;
  rows: CandidateRow[];
  theme: {
    sourceThemeCode: string | null;
    themeId: string;
    themeName: string;
    themeSlug: string;
  };
};

export type WatchlistItemView = {
  security: {
    company_name: string;
    security_id: string;
    ticker: string;
  } | null;
  status: string;
  theme: {
    source_theme_code: string | null;
    theme_id: string;
    theme_name: string;
    theme_slug: string;
  } | null;
  theme_candidate_id: string | null;
  watch_type: string;
  watchlist_item_id: string;
};

export type EvidenceRow = {
  as_of_date: string | null;
  created_at: string;
  endpoint: string | null;
  evidence_grade: string | null;
  evidence_id: string;
  fetched_at: string;
  freshness_score: number | null;
  metric_name: string;
  metric_unit: string | null;
  metric_value_num: number | null;
  metric_value_text: string | null;
  provider: string;
  reason_code: string | null;
  score_impact: number | null;
  security: {
    company_name: string;
    security_id: string;
    ticker: string;
  } | null;
  source_payload_hash: string | null;
  source_url_or_endpoint: string | null;
  theme: {
    source_theme_code: string | null;
    theme_id: string;
    theme_name: string;
    theme_slug: string;
  } | null;
};

export type AlertRow = {
  alert_id: string;
  alert_type: string;
  created_at: string;
  delivery_status: string;
  message: string;
  read_at: string | null;
  reason_codes: string[];
  security: {
    company_name: string;
    security_id: string;
    ticker: string;
  } | null;
  severity: string;
  theme: {
    source_theme_code: string | null;
    theme_id: string;
    theme_name: string;
    theme_slug: string;
  } | null;
  title: string;
};

export type TickerReportView = {
  evidence_summary: EvidenceRow[];
  security: {
    company_name: string;
    exchange: string | null;
    security_id: string;
    ticker: string;
    universe_bucket: string | null;
  };
  theme_reports: {
    candidate: {
      beneficiary_type: string | null;
      candidate_status: string;
      display_group: string | null;
      final_state: string | null;
      last_scanned_at: string | null;
      rejection_reason_codes: string[];
      review_priority_score: number | null;
      signal_scores: Record<string, SignalView>;
      signal_states: Record<string, SignalView>;
      source_of_inclusion: string;
      top_fail_reason: string | null;
      top_pass_reason: string | null;
    };
    invalidation_rules: unknown;
    theme: {
      source_theme_code: string | null;
      theme_id: string;
      theme_name: string;
      theme_slug: string;
    };
  }[];
};

export type ProviderHealthRow = {
  durationMs: number | null;
  endpoint: string;
  lastFailureAt: string | null;
  lastStatus: string;
  lastSuccessAt: string | null;
  latestCalledAt: string;
  provider: string;
  rowCount: number | null;
  sanitizedError: string | null;
  statusCode: number | null;
};

export type JobRunRow = {
  error_summary: string | null;
  finished_at: string | null;
  item_count: number;
  job_run_id: string;
  job_type: string;
  provider_calls: number;
  rows_read: number;
  rows_written: number;
  scope_id: string | null;
  scope_type: string | null;
  started_at: string;
  status: string;
};
