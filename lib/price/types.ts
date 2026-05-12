import type { PriceState, PrismaClient } from "@/generated/prisma/client";
import type {
  FmpCompanyMetric,
  MassiveAggregateBar,
} from "@/lib/providers/parsers";

export type PriceDbClient = Pick<
  PrismaClient,
  | "apiObservability"
  | "candidateSignalScore"
  | "candidateSignalState"
  | "evidenceLedger"
  | "jobItem"
  | "jobLock"
  | "jobRun"
  | "priceBarDaily"
  | "priceMetricDaily"
  | "providerPayload"
  | "security"
  | "themeBasketPrice"
  | "themeCandidate"
>;

export type PriceBar = MassiveAggregateBar;

export type PriceMetricsSnapshot = {
  atr14?: number;
  averageDollarVolume20d?: number;
  averageVolume20d?: number;
  barCount: number;
  close: number;
  date: string;
  daysAbove50dBufferLast5: number;
  distanceFrom20dAtr?: number;
  distanceFrom50dAtr?: number;
  drawdownFrom52wHigh?: number;
  high52w?: number;
  isStale: boolean;
  low52w?: number;
  ma20?: number;
  ma20Slope?: number;
  ma50?: number;
  ma50Slope?: number;
  ma200?: number;
  ma200Slope?: number;
  return1m?: number;
  return3m?: number;
  return6m?: number;
  tradingDaysSinceLastBar: number;
  upVolumeRatio20d?: number;
  volumeZscore20d?: number;
};

export type RelativeStrengthMetrics = {
  vsQqq1m?: number;
  vsQqq3m?: number;
  vsSector3m?: number;
  vsSpy1m?: number;
  vsSpy3m?: number;
  vsTheme1m?: number;
  vsTheme3m?: number;
};

export type PriceScoreComponents = {
  drawdown_resilience: number;
  relative_strength_market: number;
  relative_strength_sector: number;
  relative_strength_theme: number;
  trend_structure: number;
  volume_confirmation: number;
};

export type ValuationState =
  | "VALUATION_ROOM_AVAILABLE"
  | "FAIR"
  | "EXPENSIVE"
  | "EXTREME"
  | "INSUFFICIENT_DATA";

export type ValuationMetrics = {
  evSales?: number;
  evSalesZScore?: number;
  historyCount: number;
  pe?: number;
  peZScore?: number;
  priceToSales?: number;
};

export type ValuationScoreResult = {
  metrics: ValuationMetrics;
  reasonCodes: string[];
  state: ValuationState;
};

export type PriceScoreDetail = {
  algorithm_version: string;
  caps_applied: string[];
  components: PriceScoreComponents;
  extension: {
    extended: boolean;
    extreme: boolean;
  };
  final_score: number;
  metrics: PriceMetricsSnapshot;
  price_state: PriceState;
  reason_codes: string[];
  relative_strength: RelativeStrengthMetrics;
  theme_basket: {
    member_count: number;
    method: "equal_weight_candidates" | "seed_etf_proxy" | "insufficient_data";
    proxy_ticker?: string;
  };
  threshold_version: string;
  valuation: ValuationScoreResult;
};

export type PriceScoringInput = {
  asOfDate?: Date;
  bars: PriceBar[];
  qqqBars?: PriceBar[];
  sectorBars?: PriceBar[];
  spyBars?: PriceBar[];
  t1Score?: number;
  t1State?: string;
  t3Score?: number;
  t3State?: string;
  themeBenchmarkBars?: PriceBar[];
  themeBasketMemberCount?: number;
  themeBasketMethod?: PriceScoreDetail["theme_basket"]["method"];
  themeBenchmarkTicker?: string;
  valuation?: {
    keyMetrics?: FmpCompanyMetric[];
    ratios?: FmpCompanyMetric[];
  };
};

export type PriceScoreResult = {
  evidenceDetails: Array<{
    metricName: string;
    metricUnit?: string;
    metricValueNum?: number;
    metricValueText?: string;
    reasonCode: string;
    scoreImpact?: number;
  }>;
  score: number;
  scoreDetail: PriceScoreDetail;
  state: PriceState;
  valuationState: ValuationState;
};

export type PriceScoringOptions = {
  includeFmp?: boolean;
  includeMassive?: boolean;
  providerDataByTicker?: Record<
    string,
    {
      bars?: PriceBar[];
      keyMetrics?: FmpCompanyMetric[];
      ratios?: FmpCompanyMetric[];
    }
  >;
  themeRef?: string;
  ticker?: string;
};

export type PriceThemeSummary = {
  broken: number;
  candidatesScored: number;
  delayedCatchUp: number;
  improving: number;
  insufficientData: number;
  leader: number;
  leaderButExtended: number;
  nonParticipant: number;
  participant: number;
  priceOutranEvidence: number;
  sourceThemeCode: string;
  themeId: string;
  themeName: string;
};

export type PriceScoringSummary = {
  candidatesScored: number;
  evidenceWritten: number;
  fmpConfigured: boolean;
  jobRunId: string;
  massiveConfigured: boolean;
  providerCalls: number;
  rowsRead: number;
  rowsWritten: number;
  themes: PriceThemeSummary[];
  warnings: Array<{
    code: string;
    message: string;
    severity: "INFO" | "WARNING" | "BLOCKER";
    themeCode?: string;
    ticker?: string;
  }>;
};
