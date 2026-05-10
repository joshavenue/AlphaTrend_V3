import type { PrismaClient, ProviderName } from "@/generated/prisma/client";
import { hashPayload } from "@/lib/evidence/hash";
import { insertEvidence } from "@/lib/evidence/ledger";
import { SECURITY_MASTER_REASON_CODES } from "@/lib/security-master/reason-codes";
import type {
  PersistSecurityMasterResult,
  SecurityMasterBuildResult,
  SecurityMasterIdentifierInput,
  SecurityMasterRecord,
  SecurityMasterWarning,
} from "@/lib/security-master/types";

type SecurityMasterDbClient = Pick<
  PrismaClient,
  "evidenceLedger" | "jobItem" | "security" | "securityIdentifier"
>;

const MAX_WARNING_JOB_ITEMS = 500;

function chunk<T>(rows: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
}

function securityData(record: SecurityMasterRecord) {
  return {
    canonicalTicker: record.canonicalTicker,
    cik: record.cik ?? null,
    companyName: record.companyName,
    compositeFigi: record.compositeFigi ?? null,
    country: record.country,
    currency: record.currency,
    delistingDate: record.delistingDate ?? null,
    exchange: record.exchange,
    figi: record.figi ?? null,
    isActive: record.isActive,
    isAdr: record.isAdr,
    isDelisted: record.isDelisted,
    isEtf: record.isEtf,
    isTestIssue: record.isTestIssue,
    lastVerifiedAt: new Date(),
    listingDate: record.listingDate ?? null,
    mic: record.mic ?? null,
    securityType: record.securityType,
    shareClassFigi: record.shareClassFigi ?? null,
    universeBucket: record.universeBucket,
  };
}

function warningItemId(warning: SecurityMasterWarning, index: number) {
  return [
    warning.ticker ?? "unknown",
    warning.exchange ?? "unknown",
    warning.code,
    index,
  ].join(":");
}

async function writeJobItems(
  prisma: SecurityMasterDbClient,
  jobRunId: string,
  records: SecurityMasterRecord[],
  warnings: SecurityMasterWarning[],
) {
  let written = 0;
  const recordItems = records.map((record) => ({
    finishedAt: new Date(),
    itemId: `${record.canonicalTicker}:${record.exchange}`,
    itemType: "SECURITY_MASTER_RECORD",
    jobRunId,
    startedAt: new Date(),
    status: "SUCCEEDED" as const,
  }));

  for (const batch of chunk(recordItems, 1_000)) {
    const result = await prisma.jobItem.createMany({
      data: batch,
    });
    written += result.count;
  }

  const warningItems = warnings
    .filter(
      (item) =>
        item.code !== SECURITY_MASTER_REASON_CODES.MISSING_FIGI &&
        item.code !== SECURITY_MASTER_REASON_CODES.MISSING_CIK,
    )
    .slice(0, MAX_WARNING_JOB_ITEMS)
    .map((item, index) => ({
      errorSummary: item.message.slice(0, 250),
      finishedAt: new Date(),
      itemId: warningItemId(item, index),
      itemType: `SECURITY_MASTER_WARNING:${item.code}`,
      jobRunId,
      startedAt: new Date(),
      status:
        item.severity === "BLOCKER"
          ? ("FAILED" as const)
          : ("SKIPPED" as const),
    }));

  if (warningItems.length > 0) {
    const result = await prisma.jobItem.createMany({
      data: warningItems,
    });
    written += result.count;
  }

  return written;
}

async function upsertIdentifier(
  prisma: SecurityMasterDbClient,
  jobRunId: string,
  securityId: string,
  identifier: SecurityMasterIdentifierInput,
) {
  const existing = await prisma.securityIdentifier.findUnique({
    where: {
      provider_identifierType_identifierValue: {
        identifierType: identifier.identifierType,
        identifierValue: identifier.identifierValue,
        provider: identifier.provider,
      },
    },
  });

  if (existing && existing.securityId !== securityId) {
    await prisma.jobItem.create({
      data: {
        errorSummary: `Identifier already belongs to security ${existing.securityId}`,
        finishedAt: new Date(),
        itemId: `${identifier.provider}:${identifier.identifierType}:${identifier.identifierValue}`,
        itemType: `SECURITY_MASTER_WARNING:${SECURITY_MASTER_REASON_CODES.IDENTIFIER_CONFLICT}`,
        jobRunId,
        startedAt: new Date(),
        status: "SKIPPED",
      },
    });
    return 0;
  }

  if (existing) {
    return 0;
  }

  await prisma.securityIdentifier.create({
    data: {
      confidence: identifier.confidence,
      identifierType: identifier.identifierType,
      identifierValue: identifier.identifierValue,
      provider: identifier.provider,
      securityId,
      sourcePayloadHash: identifier.sourcePayloadHash,
    },
  });

  return 1;
}

async function figiIsAvailable(
  prisma: SecurityMasterDbClient,
  record: SecurityMasterRecord,
) {
  if (!record.figi) {
    return true;
  }

  const existing = await prisma.security.findUnique({
    where: {
      figi: record.figi,
    },
  });

  return (
    !existing ||
    (existing.canonicalTicker === record.canonicalTicker &&
      existing.exchange === record.exchange)
  );
}

async function writeSummaryEvidence(
  prisma: SecurityMasterDbClient,
  jobRunId: string,
  build: SecurityMasterBuildResult,
) {
  const sourcePayloadHash = hashPayload(build.summary);
  const metrics: Array<{
    provider: ProviderName;
    metricName: string;
    metricValueNum: number;
  }> = [
    {
      metricName: "security_master_records_built",
      metricValueNum: build.summary.recordsBuilt,
      provider: "NASDAQ_TRADER",
    },
    {
      metricName: "security_master_active_common_stock_count",
      metricValueNum: build.summary.activeCommonStocks,
      provider: "NASDAQ_TRADER",
    },
    {
      metricName: "security_master_etf_count",
      metricValueNum: build.summary.etfs,
      provider: "NASDAQ_TRADER",
    },
    {
      metricName: "security_master_adr_count",
      metricValueNum: build.summary.adrs,
      provider: "NASDAQ_TRADER",
    },
    {
      metricName: "security_master_warning_count",
      metricValueNum: build.summary.warnings,
      provider: "NASDAQ_TRADER",
    },
    {
      metricName: "security_master_missing_figi_count",
      metricValueNum: build.summary.missingFigi,
      provider: "OPENFIGI",
    },
  ];

  let written = 0;

  for (const metric of metrics) {
    await insertEvidence(prisma, {
      endpoint: "security_master_refresh",
      entityId: "security_master",
      entityType: "job_summary",
      evidenceGrade: metric.provider === "OPENFIGI" ? "C" : "B",
      fetchedAt: new Date(),
      jobRunId,
      metricName: metric.metricName,
      metricUnit: "count",
      metricValueNum: metric.metricValueNum,
      provider: metric.provider,
      sourcePayloadHash,
      sourceUrlOrEndpoint: "security_master_refresh",
    });
    written += 1;
  }

  return written;
}

export async function persistSecurityMaster(
  prisma: SecurityMasterDbClient,
  jobRunId: string,
  build: SecurityMasterBuildResult,
): Promise<PersistSecurityMasterResult> {
  let securitiesWritten = 0;
  let identifiersWritten = 0;
  let warningsWritten = 0;

  for (const record of build.records) {
    const figiAvailable = await figiIsAvailable(prisma, record);
    const data = securityData({
      ...record,
      figi: figiAvailable ? record.figi : undefined,
    });

    if (!figiAvailable) {
      warningsWritten += 1;
      await prisma.jobItem.create({
        data: {
          errorSummary: `FIGI ${record.figi} is already assigned to a different security.`,
          finishedAt: new Date(),
          itemId: `${record.canonicalTicker}:${record.exchange}:${record.figi}`,
          itemType: `SECURITY_MASTER_WARNING:${SECURITY_MASTER_REASON_CODES.FIGI_CONFLICT}`,
          jobRunId,
          startedAt: new Date(),
          status: "SKIPPED",
        },
      });
    }

    const security = await prisma.security.upsert({
      create: data,
      update: data,
      where: {
        canonicalTicker_exchange: {
          canonicalTicker: record.canonicalTicker,
          exchange: record.exchange,
        },
      },
    });
    securitiesWritten += 1;

    for (const identifier of record.identifiers) {
      identifiersWritten += await upsertIdentifier(
        prisma,
        jobRunId,
        security.securityId,
        identifier,
      );
    }
  }

  const jobItemsWritten = await writeJobItems(
    prisma,
    jobRunId,
    build.records,
    build.warnings,
  );
  const evidenceWritten = await writeSummaryEvidence(prisma, jobRunId, build);

  return {
    evidenceWritten,
    identifiersWritten,
    jobItemsWritten,
    securitiesWritten,
    warningsWritten,
  };
}
