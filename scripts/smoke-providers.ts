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
import type { ProviderResult } from "@/lib/providers/types";

type SmokeResult = ProviderResult<unknown> & {
  evidenceWritten: number;
};

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

    const failedConfiguredCalls = results.filter(
      (result) =>
        !result.ok &&
        result.status !== "UNCONFIGURED" &&
        result.status !== "LICENSE_BLOCKED",
    );
    const licenseBlockedCalls = results.filter(
      (result) => result.status === "LICENSE_BLOCKED",
    );
    const rowsRead = results.reduce(
      (sum, result) => sum + (result.rowCount ?? 0),
      0,
    );
    const evidenceWritten = results.reduce(
      (sum, result) => sum + result.evidenceWritten,
      0,
    );
    const providerCalls = results.filter(
      (result) => result.status !== "UNCONFIGURED",
    ).length;

    await prisma.jobRun.update({
      data: {
        errorSummary:
          failedConfiguredCalls.length || licenseBlockedCalls.length
            ? [
                failedConfiguredCalls.length
                  ? `${failedConfiguredCalls.length} provider calls failed`
                  : undefined,
                licenseBlockedCalls.length
                  ? `${licenseBlockedCalls.length} provider calls license-blocked`
                  : undefined,
              ]
                .filter(Boolean)
                .join("; ")
            : undefined,
        finishedAt: new Date(),
        providerCalls,
        rowsRead,
        rowsWritten: evidenceWritten,
        status:
          failedConfiguredCalls.length || licenseBlockedCalls.length
            ? "PARTIAL"
            : "SUCCEEDED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    console.log(formatTable(results));

    if (failedConfiguredCalls.length) {
      process.exitCode = 1;
    }
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

await main();
