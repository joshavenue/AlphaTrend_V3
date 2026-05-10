import type {
  IdentifierConfidence,
  ProviderName,
} from "@/generated/prisma/client";
import type { SecurityType, UniverseBucket } from "@/lib/domain/types";
import type { SecurityMasterReasonCode } from "@/lib/security-master/reason-codes";

export type SecurityMasterSeverity = "INFO" | "WARNING" | "BLOCKER";

export type SecurityMasterWarning = {
  code: SecurityMasterReasonCode;
  severity: SecurityMasterSeverity;
  ticker?: string;
  exchange?: string;
  message: string;
  providers?: ProviderName[];
  detail?: Record<string, unknown>;
};

export type SecurityMasterIdentifierInput = {
  provider: ProviderName;
  identifierType: string;
  identifierValue: string;
  confidence: IdentifierConfidence;
  sourcePayloadHash?: string;
};

export type SecurityMasterRecord = {
  canonicalTicker: string;
  companyName: string;
  exchange: string;
  mic?: string;
  country: string;
  currency: string;
  securityType: SecurityType;
  universeBucket: UniverseBucket;
  isActive: boolean;
  isTestIssue: boolean;
  isEtf: boolean;
  isAdr: boolean;
  isDelisted: boolean;
  cik?: string;
  figi?: string;
  compositeFigi?: string;
  shareClassFigi?: string;
  listingDate?: Date;
  delistingDate?: Date;
  identifiers: SecurityMasterIdentifierInput[];
};

export type SecurityMasterProviderPayloadRefs = Partial<
  Record<
    ProviderName,
    {
      endpoint: string;
      payloadId?: string;
      responseHash?: string;
    }
  >
>;

export type SecurityMasterBuildInputCounts = {
  secTickers: number;
  nasdaqListed: number;
  otherListed: number;
  massiveTickers: number;
  openFigiMappings: number;
  alphaActiveListings: number;
  alphaDelistedListings: number;
};

export type SecurityMasterSummary = SecurityMasterBuildInputCounts & {
  recordsBuilt: number;
  skippedTestIssues: number;
  duplicateProviderSymbols: number;
  warnings: number;
  activeCommonStocks: number;
  etfs: number;
  adrs: number;
  delisted: number;
  reviewRequired: number;
  missingCik: number;
  missingFigi: number;
};

export type SecurityMasterBuildResult = {
  records: SecurityMasterRecord[];
  warnings: SecurityMasterWarning[];
  summary: SecurityMasterSummary;
  providerPayloadRefs: SecurityMasterProviderPayloadRefs;
};

export type PersistSecurityMasterResult = {
  securitiesWritten: number;
  identifiersWritten: number;
  jobItemsWritten: number;
  evidenceWritten: number;
  warningsWritten: number;
};
