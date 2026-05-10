import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPrismaClient } from "@/lib/db/prisma";
import {
  fetchAlphaVantageListings,
  fetchMassiveReferenceTickers,
  fetchNasdaqListed,
  fetchNasdaqOtherListed,
  fetchSecCompanyTickers,
  mapOpenFigiTickers,
} from "@/lib/providers/clients";
import type {
  AlphaVantageListing,
  MassiveTicker,
  NasdaqSymbol,
  OpenFigiMapping,
  SecCompanyTicker,
} from "@/lib/providers/parsers";
import type { ProviderResult } from "@/lib/providers/types";
import { buildSecurityMaster } from "@/lib/security-master/builder";
import { persistSecurityMaster } from "@/lib/security-master/persist";
import { formatSecurityMasterReport } from "@/lib/security-master/report";
import type {
  SecurityMasterProviderPayloadRefs,
  SecurityMasterRecord,
} from "@/lib/security-master/types";

const LOCK_KEY = "security_master:refresh";
const LOCK_TTL_MS = 30 * 60 * 1_000;
const OPENFIGI_BATCH_SIZE = 5;

type ProviderStatusRow = {
  provider: string;
  endpoint: string;
  status: string;
  rows: number;
  error?: string;
};

function parseArgs(argv: string[]) {
  const options = {
    alpha: true,
    figiLimit: 5,
    massive: true,
    openFigi: true,
  };

  for (const arg of argv) {
    if (arg === "--alpha=off" || arg === "--alpha=false") {
      options.alpha = false;
    } else if (arg === "--massive=off" || arg === "--massive=false") {
      options.massive = false;
    } else if (arg === "--openfigi=off" || arg === "--openfigi=false") {
      options.openFigi = false;
    } else if (arg.startsWith("--figi-limit=")) {
      const value = Number(arg.split("=")[1]);

      if (!Number.isInteger(value) || value < 0) {
        throw new Error("--figi-limit must be a non-negative integer.");
      }

      options.figiLimit = value;
    }
  }

  return options;
}

function shortError(error: string | undefined) {
  if (!error) {
    return undefined;
  }

  return error.length > 120 ? `${error.slice(0, 117)}...` : error;
}

function providerStatus(result: ProviderResult<unknown>): ProviderStatusRow {
  return {
    endpoint: result.endpoint,
    error: shortError(result.sanitizedError),
    provider: result.provider,
    rows: result.rowCount ?? 0,
    status: result.status,
  };
}

function payloadRefsFromResults(
  results: ProviderResult<unknown>[],
): SecurityMasterProviderPayloadRefs {
  const refs: SecurityMasterProviderPayloadRefs = {};

  for (const result of results) {
    if (result.payloadId || result.responseHash) {
      refs[result.provider] = {
        endpoint: result.endpoint,
        payloadId: result.payloadId,
        responseHash: result.responseHash,
      };
    }
  }

  return refs;
}

function rowsRead(results: ProviderResult<unknown>[]) {
  return results.reduce((sum, result) => sum + (result.rowCount ?? 0), 0);
}

function providerCalls(results: ProviderResult<unknown>[]) {
  return results.filter((result) => result.status !== "UNCONFIGURED").length;
}

function mandatoryProviderFailure(results: ProviderResult<unknown>[]) {
  return results.find(
    (result) =>
      ["SEC", "NASDAQ_TRADER"].includes(result.provider) &&
      result.status !== "SUCCESS",
  );
}

function optionalProviderFailure(results: ProviderResult<unknown>[]) {
  return results.find(
    (result) =>
      result.status !== "UNCONFIGURED" &&
      result.status !== "SUCCESS" &&
      ["MASSIVE", "OPENFIGI", "ALPHA_VANTAGE"].includes(result.provider),
  );
}

function invariantFailure(build: ReturnType<typeof buildSecurityMaster>) {
  const blockers = build.warnings.filter(
    (warning) => warning.severity === "BLOCKER",
  );

  if (blockers.length === 0) {
    return undefined;
  }

  return `${blockers.length} security master invariant violation(s): ${blockers
    .slice(0, 3)
    .map((warning) => `${warning.ticker ?? "unknown"} ${warning.code}`)
    .join("; ")}`;
}

function selectOpenFigiTickers(records: SecurityMasterRecord[], limit: number) {
  const priority = ["AAPL", "MSFT", "NVDA", "SPY", "SMH", "QQQ"];
  const seen = new Set<string>();
  const tickers: string[] = [];
  const push = (ticker: string) => {
    if (!seen.has(ticker) && tickers.length < limit) {
      seen.add(ticker);
      tickers.push(ticker);
    }
  };

  for (const ticker of priority) {
    push(ticker);
  }

  for (const record of records) {
    if (
      record.universeBucket === "US_COMMON_ALL" ||
      record.universeBucket === "US_ETF_ALL"
    ) {
      push(record.canonicalTicker);
    }
  }

  return tickers;
}

async function mapOpenFigiInBatches(
  context: {
    jobRunId: string;
    prisma: ReturnType<typeof createPrismaClient>;
  },
  tickers: string[],
) {
  const results: ProviderResult<OpenFigiMapping[]>[] = [];

  for (let index = 0; index < tickers.length; index += OPENFIGI_BATCH_SIZE) {
    const batch = tickers.slice(index, index + OPENFIGI_BATCH_SIZE);
    results.push(await mapOpenFigiTickers(context, batch));
  }

  return results;
}

async function acquireLock(
  prisma: ReturnType<typeof createPrismaClient>,
  jobRunId: string,
) {
  const now = new Date();

  await prisma.jobLock.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
      lockKey: LOCK_KEY,
    },
  });

  try {
    await prisma.jobLock.create({
      data: {
        expiresAt: new Date(now.getTime() + LOCK_TTL_MS),
        jobRunId,
        lockKey: LOCK_KEY,
        ownerId: "security-master-refresh-cli",
      },
    });
  } catch {
    throw new Error("SECURITY_MASTER_REFRESH is already running.");
  }
}

async function releaseLock(
  prisma: ReturnType<typeof createPrismaClient>,
  jobRunId: string,
) {
  await prisma.jobLock.deleteMany({
    where: {
      jobRunId,
      lockKey: LOCK_KEY,
    },
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = createPrismaClient();

  await prisma.$connect();

  const jobRun = await prisma.jobRun.create({
    data: {
      jobType: "SECURITY_MASTER_REFRESH",
      scopeId: "us",
      scopeType: "security_master",
      status: "STARTED",
    },
  });
  const context = {
    jobRunId: jobRun.jobRunId,
    prisma,
  };
  const providerResults: ProviderResult<unknown>[] = [];

  try {
    await acquireLock(prisma, jobRun.jobRunId);

    const secTickers = await fetchSecCompanyTickers(context);
    const nasdaqListed = await fetchNasdaqListed(context);
    const otherListed = await fetchNasdaqOtherListed(context);
    providerResults.push(secTickers, nasdaqListed, otherListed);

    const requiredFailure = mandatoryProviderFailure(providerResults);

    if (requiredFailure) {
      throw new Error(
        `${requiredFailure.provider}:${requiredFailure.endpoint} failed: ${
          requiredFailure.sanitizedError ?? requiredFailure.status
        }`,
      );
    }

    let massiveTickers: ProviderResult<MassiveTicker[]> | undefined;

    if (options.massive) {
      massiveTickers = await fetchMassiveReferenceTickers(context, {
        active: true,
        limit: 1000,
      });
      providerResults.push(massiveTickers);
    }

    let alphaActiveListings: ProviderResult<AlphaVantageListing[]> | undefined;
    let alphaDelistedListings:
      | ProviderResult<AlphaVantageListing[]>
      | undefined;

    if (options.alpha) {
      alphaActiveListings = await fetchAlphaVantageListings(context, "active");
      alphaDelistedListings = await fetchAlphaVantageListings(
        context,
        "delisted",
      );
      providerResults.push(alphaActiveListings, alphaDelistedListings);
    }

    const preFigiBuild = buildSecurityMaster({
      alphaActiveListings: alphaActiveListings?.data,
      alphaDelistedListings: alphaDelistedListings?.data,
      massiveTickers: massiveTickers?.data,
      nasdaqListed: nasdaqListed.data as NasdaqSymbol[],
      otherListed: otherListed.data as NasdaqSymbol[],
      providerPayloadRefs: payloadRefsFromResults(providerResults),
      secTickers: secTickers.data as SecCompanyTicker[],
    });
    const figiResults: ProviderResult<OpenFigiMapping[]>[] = [];

    if (options.openFigi && options.figiLimit > 0) {
      const tickers = selectOpenFigiTickers(
        preFigiBuild.records,
        options.figiLimit,
      );
      figiResults.push(...(await mapOpenFigiInBatches(context, tickers)));
      providerResults.push(...figiResults);
    }

    const openFigiMappings = figiResults.flatMap((result) => result.data ?? []);
    const build = buildSecurityMaster({
      alphaActiveListings: alphaActiveListings?.data,
      alphaDelistedListings: alphaDelistedListings?.data,
      massiveTickers: massiveTickers?.data,
      nasdaqListed: nasdaqListed.data as NasdaqSymbol[],
      openFigiMappings,
      otherListed: otherListed.data as NasdaqSymbol[],
      providerPayloadRefs: payloadRefsFromResults(providerResults),
      secTickers: secTickers.data as SecCompanyTicker[],
    });
    const blockerSummary = invariantFailure(build);

    if (blockerSummary) {
      throw new Error(blockerSummary);
    }

    const persistence = await persistSecurityMaster(
      prisma,
      jobRun.jobRunId,
      build,
    );
    const optionalFailure = optionalProviderFailure(providerResults);
    const status = optionalFailure ? "PARTIAL" : "SUCCEEDED";
    const errorSummary = optionalFailure
      ? `${optionalFailure.provider}:${optionalFailure.endpoint} ${optionalFailure.status}`
      : null;

    await prisma.jobRun.update({
      data: {
        errorSummary,
        finishedAt: new Date(),
        providerCalls: providerCalls(providerResults),
        rowsRead: rowsRead(providerResults),
        rowsWritten:
          persistence.securitiesWritten +
          persistence.identifiersWritten +
          persistence.evidenceWritten,
        status,
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    console.log(
      formatSecurityMasterReport({
        jobRunId: jobRun.jobRunId,
        persistence,
        providerStatuses: providerResults.map(providerStatus),
        summary: build.summary,
      }),
    );

    process.exitCode = status === "SUCCEEDED" ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.jobRun.update({
      data: {
        errorSummary: shortError(message),
        finishedAt: new Date(),
        providerCalls: providerCalls(providerResults),
        rowsRead: rowsRead(providerResults),
        status: "FAILED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    throw error;
  } finally {
    await releaseLock(prisma, jobRun.jobRunId);
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
