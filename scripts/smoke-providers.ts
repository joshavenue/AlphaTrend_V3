import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPrismaClient } from "@/lib/db/prisma";
import { insertEvidence } from "@/lib/evidence/ledger";
import {
  fetchAlphaVantageListings,
  fetchBeaDatasets,
  fetchBlsCpiSeries,
  fetchEiaRoutes,
  fetchFmpEtfHoldings,
  fetchFmpIncomeStatement,
  fetchFmpKeyMetrics,
  fetchFredObservations,
  fetchMassiveDailyBars,
  fetchMassiveReferenceTicker,
  fetchNasdaqListed,
  fetchNasdaqOtherListed,
  fetchSecCompanyFacts,
  fetchSecCompanyTickers,
  fetchUsaSpendingAwards,
  mapOpenFigiTicker,
} from "@/lib/providers/clients";
import type { SecCompanyTicker } from "@/lib/providers/parsers";
import {
  classifySmokeRun,
  type SmokeResult,
} from "@/lib/providers/smoke-summary";
import type { ProviderResult } from "@/lib/providers/types";

function shortError(error: string | undefined) {
  if (!error) {
    return "";
  }

  return error.length > 96 ? `${error.slice(0, 93)}...` : error;
}

function statusLabel(result: ProviderResult<unknown>) {
  if (result.status === "UNCONFIGURED") {
    return "skipped";
  }

  if (result.status === "LICENSE_BLOCKED") {
    return "license";
  }

  return result.ok ? "pass" : "fail";
}

function formatTable(results: SmokeResult[]) {
  const rows = results.map((result) => [
    result.provider,
    result.endpoint,
    statusLabel(result),
    String(result.durationMs),
    String(result.rowCount ?? 0),
    String(result.evidenceWritten),
    shortError(result.sanitizedError),
  ]);
  const headers = [
    "provider",
    "endpoint",
    "status",
    "duration_ms",
    "row_count",
    "evidence_written",
    "error",
  ];
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );
  const renderRow = (row: string[]) =>
    row.map((cell, index) => cell.padEnd(widths[index])).join(" | ");

  return [
    renderRow(headers),
    widths.map((width) => "-".repeat(width)).join("-|-"),
    ...rows.map(renderRow),
  ].join("\n");
}

function findAaplCik(result: ProviderResult<SecCompanyTicker[]>) {
  return result.data?.find((row) => row.ticker === "AAPL")?.cik;
}

async function writeSmokeEvidence(
  prisma: ReturnType<typeof createPrismaClient>,
  jobRunId: string,
  result: ProviderResult<unknown>,
) {
  if (!result.ok || !result.payloadId) {
    return 0;
  }

  await insertEvidence(prisma, {
    endpoint: result.endpoint,
    entityId: `${result.provider}:${result.endpoint}`,
    entityType: "provider_smoke",
    evidenceGrade: "D",
    fetchedAt: new Date(result.fetchedAt),
    jobRunId,
    metricName: "provider_smoke_row_count",
    metricUnit: "rows",
    metricValueNum: result.rowCount ?? 0,
    payloadId: result.payloadId,
    provider: result.provider,
    sourceUrlOrEndpoint: result.endpoint,
  });

  return 1;
}

async function recordResult(
  prisma: ReturnType<typeof createPrismaClient>,
  jobRunId: string,
  result: ProviderResult<unknown>,
): Promise<SmokeResult> {
  return {
    ...result,
    evidenceWritten: await writeSmokeEvidence(prisma, jobRunId, result),
  };
}

async function main() {
  const prisma = createPrismaClient();

  await prisma.$connect();

  const jobRun = await prisma.jobRun.create({
    data: {
      jobType: "PROVIDER_SMOKE",
      scopeId: "all",
      scopeType: "provider",
      status: "STARTED",
    },
  });
  const context = {
    jobRunId: jobRun.jobRunId,
    prisma,
  };
  const results: SmokeResult[] = [];

  try {
    const secTickers = await fetchSecCompanyTickers(context);
    results.push(await recordResult(prisma, jobRun.jobRunId, secTickers));

    if (secTickers.status !== "UNCONFIGURED") {
      const aaplCik = findAaplCik(secTickers) ?? "0000320193";
      results.push(
        await recordResult(
          prisma,
          jobRun.jobRunId,
          await fetchSecCompanyFacts(context, aaplCik),
        ),
      );
    }

    for (const call of [
      () => fetchNasdaqListed(context),
      () => fetchNasdaqOtherListed(context),
      () => fetchMassiveReferenceTicker(context, "AAPL"),
      () => fetchMassiveDailyBars(context, "AAPL"),
      () => mapOpenFigiTicker(context, "AAPL"),
      () => fetchFmpKeyMetrics(context, "AAPL"),
      () => fetchFmpIncomeStatement(context, "AAPL"),
      () => fetchFmpEtfHoldings(context, "SMH"),
      () => fetchAlphaVantageListings(context, "active"),
      () => fetchFredObservations(context, "DGS10"),
      () => fetchBeaDatasets(context),
      () => fetchBlsCpiSeries(context),
      () => fetchEiaRoutes(context),
      () => fetchUsaSpendingAwards(context),
    ]) {
      results.push(await recordResult(prisma, jobRun.jobRunId, await call()));
    }

    const classification = classifySmokeRun(results);

    await prisma.jobRun.update({
      data: {
        errorSummary: classification.errorSummary,
        finishedAt: new Date(),
        providerCalls: classification.providerCalls,
        rowsRead: classification.rowsRead,
        rowsWritten: classification.evidenceWritten,
        status: classification.jobStatus,
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    console.log(formatTable(results));

    process.exitCode = classification.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.jobRun.update({
      data: {
        errorSummary: shortError(message),
        finishedAt: new Date(),
        status: "FAILED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
