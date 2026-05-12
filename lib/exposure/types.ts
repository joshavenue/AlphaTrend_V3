import type {
  BeneficiaryType,
  CandidateStatus,
  PrismaClient,
} from "@/generated/prisma/client";

export type ExposureDbClient = Pick<
  PrismaClient,
  | "apiObservability"
  | "candidateSignalScore"
  | "candidateSignalState"
  | "evidenceLedger"
  | "jobItem"
  | "jobLock"
  | "jobRun"
  | "providerPayload"
  | "security"
  | "themeCandidate"
  | "themeDefinition"
>;

export type ExposureSourceKind =
  | "company_name"
  | "manual_seed"
  | "provider_profile"
  | "provider_screener"
  | "sec_companyfacts"
  | "seed_etf";

export type ExposureCategoryType = "direct" | "indirect" | "excluded";

export type ExposureTextSource = {
  kind: ExposureSourceKind;
  label: string;
  provider?: "FMP" | "SEC" | "ALPHATREND_INTERNAL";
  text: string;
};

export type ExposureCategory = {
  displayLabel: string;
  normalizedLabel: string;
  synonyms: string[];
  type: ExposureCategoryType;
};

export type ExposureCategoryMatch = {
  category: ExposureCategory;
  matchedText: string;
  source: ExposureTextSource;
  strength: "phrase" | "synonym" | "token";
};

export type ExposureScoreComponents = {
  customer_end_market_fit: number;
  etf_theme_basket_membership: number;
  excluded_category_penalty: number;
  management_filing_language_support: number;
  product_business_line_match: number;
  revenue_exposure_to_theme: number;
  segment_disclosure_support: number;
};

export type ExposureScoreDetail = {
  algorithm_version: string;
  beneficiary_type: BeneficiaryType;
  caps_applied: string[];
  components: ExposureScoreComponents;
  final_score: number;
  matched_categories: {
    direct: string[];
    excluded: string[];
    indirect: string[];
  };
  reason_codes: string[];
  threshold_version: string;
};

export type ExposureScoringInput = {
  candidate: {
    sourceDetail: unknown;
    sourceOfInclusion: string;
    themeCandidateId: string;
  };
  fmpProfile?: {
    companyName?: string;
    description?: string;
    industry?: string;
    sector?: string;
    symbol: string;
  };
  manualSeed?: {
    beneficiaryType: string;
    candidateRole: string;
    notes: string;
  };
  secCompanyFacts?: {
    revenueFactTags: string[];
  };
  security: {
    canonicalTicker: string;
    companyName: string;
  };
  theme: {
    directBeneficiaryCategories: unknown;
    excludedCategories: unknown;
    indirectBeneficiaryCategories: unknown;
    seedEtfs: unknown;
    sourceThemeCode: string | null;
    themeId: string;
    themeName: string;
  };
};

export type ExposureScoreResult = {
  beneficiaryType: BeneficiaryType;
  candidateStatus: CandidateStatus;
  displayGroup: string;
  evidenceDetails: Array<{
    metricName: string;
    metricValueText?: string;
    reasonCode: string;
    scoreImpact?: number;
  }>;
  score: number;
  scoreDetail: ExposureScoreDetail;
};

export type ExposureScoringOptions = {
  companySeedPath?: string;
  includeFmp?: boolean;
  includeSec?: boolean;
  themeRef?: string;
  ticker?: string;
};

export type ExposureThemeSummary = {
  candidatesScored: number;
  directBeneficiaries: number;
  majorBeneficiaries: number;
  rejectedOrWrongTicker: number;
  reviewRequired: number;
  sourceThemeCode: string;
  themeId: string;
  themeName: string;
  watchOnly: number;
};

export type ExposureScoringSummary = {
  candidatesScored: number;
  evidenceWritten: number;
  fmpConfigured: boolean;
  jobRunId: string;
  providerCalls: number;
  rowsRead: number;
  rowsWritten: number;
  secConfigured: boolean;
  themes: ExposureThemeSummary[];
  warnings: Array<{
    code: string;
    message: string;
    severity: "INFO" | "WARNING" | "BLOCKER";
    themeCode?: string;
    ticker?: string;
  }>;
};
