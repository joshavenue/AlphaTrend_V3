import type {
  JobStatus,
  JobType,
  PrismaClient,
  ProviderName,
} from "@/generated/prisma/client";
import { evaluateAlerts } from "@/lib/alerts/runner";
import { generateThemeCandidates } from "@/lib/candidates/generator";
import {
  fetchEconomicDemand,
  scoreEconomicDemandThemes,
} from "@/lib/demand/runner";
import { scoreThemeExposure } from "@/lib/exposure/runner";
import { scoreThemeExpressions } from "@/lib/expression/runner";
import { scoreThemeFundamentals } from "@/lib/fundamentals/runner";
import { scoreThemeLiquidity } from "@/lib/liquidity/runner";
import { scoreThemePrices } from "@/lib/price/runner";
import { buildThemeSnapshots } from "@/lib/snapshots/runner";

const OPS_LOCK_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ERROR_LENGTH = 512;

export type OperationalStageStatus = "SUCCEEDED" | "PARTIAL" | "FAILED";

export type OperationalStageSummary = {
  evidenceWritten?: number;
  jobRunId?: string;
  providerCalls: number;
  rowsRead: number;
  rowsWritten: number;
  stage: string;
  status: OperationalStageStatus;
  warnings: number;
};

export type OperationalRefreshSummary = {
  jobRunId: string;
  providerCalls: number;
  rowsRead: number;
  rowsWritten: number;
  scopeId: string;
  stages: OperationalStageSummary[];
  status: JobStatus;
};

export type ThemeScanOrchestrationOptions = {
  candidateIncludeFmp?: boolean;
  candidateIncludeManualSeeds?: boolean;
  demandProvider?: ProviderName;
  exposureIncludeFmp?: boolean;
  exposureIncludeSec?: boolean;
  fundamentalsIncludeFmp?: boolean;
  fundamentalsIncludeSec?: boolean;
  includeDemand?: boolean;
  liquidityIncludeFmp?: boolean;
  liquidityIncludeMassive?: boolean;
  liquidityIncludeSec?: boolean;
  priceIncludeFmp?: boolean;
  priceIncludeMassive?: boolean;
  themeRef?: string;
};

export type DemandRefreshOrchestrationOptions = {
  includeAlerts?: boolean;
  includeSnapshots?: boolean;
  provider?: ProviderName;
  themeRef?: string;
};

type StageResult = {
  evidenceWritten?: number;
  jobRunId?: string;
  providerCalls?: number;
  rowsRead: number;
  rowsWritten: number;
  warnings?: unknown[];
};

function shortError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > MAX_ERROR_LENGTH
    ? `${message.slice(0, MAX_ERROR_LENGTH - 3)}...`
    : message;
}

function scopeId(themeRef: string | undefined) {
  const trimmed = themeRef?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "all-active";
}

async function acquireLock(
  prisma: PrismaClient,
  jobRunId: string,
  lockKey: string,
) {
  const now = new Date();

  await prisma.jobLock.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
      lockKey,
    },
  });

  try {
    await prisma.jobLock.create({
      data: {
        expiresAt: new Date(now.getTime() + OPS_LOCK_TTL_MS),
        jobRunId,
        lockKey,
        lockedAt: now,
        ownerId: `ops:${process.pid}`,
      },
    });
  } catch {
    throw new Error(`Operational lock is already held: ${lockKey}`);
  }
}

async function releaseLock(
  prisma: PrismaClient,
  jobRunId: string,
  lockKey: string,
) {
  await prisma.jobLock.deleteMany({
    where: {
      jobRunId,
      lockKey,
    },
  });
}

function statusForResult(result: StageResult): OperationalStageStatus {
  return (result.warnings?.length ?? 0) > 0 ? "PARTIAL" : "SUCCEEDED";
}

function summarizeStage(stage: string, result: StageResult) {
  return {
    evidenceWritten: result.evidenceWritten,
    jobRunId: result.jobRunId,
    providerCalls: result.providerCalls ?? 0,
    rowsRead: result.rowsRead,
    rowsWritten: result.rowsWritten,
    stage,
    status: statusForResult(result),
    warnings: result.warnings?.length ?? 0,
  } satisfies OperationalStageSummary;
}

function aggregateStages(stages: OperationalStageSummary[]) {
  return stages.reduce(
    (acc, stage) => ({
      providerCalls: acc.providerCalls + stage.providerCalls,
      rowsRead: acc.rowsRead + stage.rowsRead,
      rowsWritten: acc.rowsWritten + stage.rowsWritten + 1,
    }),
    { providerCalls: 0, rowsRead: 0, rowsWritten: 0 },
  );
}

function finalStatus(stages: OperationalStageSummary[]): JobStatus {
  return stages.some((stage) => stage.status === "FAILED")
    ? "FAILED"
    : stages.some((stage) => stage.status === "PARTIAL")
      ? "PARTIAL"
      : "SUCCEEDED";
}

async function runStage(
  prisma: PrismaClient,
  parentJobRunId: string,
  stage: string,
  execute: () => Promise<StageResult>,
) {
  const jobItem = await prisma.jobItem.create({
    data: {
      attemptCount: 1,
      itemId: stage,
      itemType: "ORCHESTRATION_STAGE",
      jobRunId: parentJobRunId,
      startedAt: new Date(),
      status: "RUNNING",
    },
  });

  try {
    const result = await execute();
    const summary = summarizeStage(stage, result);

    await prisma.jobItem.update({
      data: {
        finishedAt: new Date(),
        status: summary.status === "FAILED" ? "FAILED" : "SUCCEEDED",
      },
      where: {
        jobItemId: jobItem.jobItemId,
      },
    });

    return summary;
  } catch (error) {
    await prisma.jobItem.update({
      data: {
        errorSummary: shortError(error),
        finishedAt: new Date(),
        status: "FAILED",
      },
      where: {
        jobItemId: jobItem.jobItemId,
      },
    });

    throw error;
  }
}

async function createParentJob(
  prisma: PrismaClient,
  jobType: JobType,
  scopeType: string,
  scope: string,
) {
  return prisma.jobRun.create({
    data: {
      jobType,
      scopeId: scope,
      scopeType,
      status: "STARTED",
    },
  });
}

async function finishParentJob(
  prisma: PrismaClient,
  jobRunId: string,
  stages: OperationalStageSummary[],
  status: JobStatus,
  errorSummary?: string,
) {
  const totals = aggregateStages(stages);

  await prisma.jobRun.update({
    data: {
      errorSummary,
      finishedAt: new Date(),
      providerCalls: totals.providerCalls,
      rowsRead: totals.rowsRead,
      rowsWritten: totals.rowsWritten,
      status,
    },
    where: {
      jobRunId,
    },
  });

  return totals;
}

export async function runThemeScanOrchestration(
  prisma: PrismaClient,
  options: ThemeScanOrchestrationOptions = {},
): Promise<OperationalRefreshSummary> {
  const scope = scopeId(options.themeRef);
  const jobRun = await createParentJob(
    prisma,
    "THEME_SCAN_ORCHESTRATION",
    "theme_scan_orchestration",
    scope,
  );
  const lockKey = `theme_scan_orchestration:${scope}`;
  const stages: OperationalStageSummary[] = [];

  try {
    await acquireLock(prisma, jobRun.jobRunId, lockKey);

    stages.push(
      await runStage(prisma, jobRun.jobRunId, "candidate_generation", () =>
        generateThemeCandidates(prisma, {
          includeFmp: options.candidateIncludeFmp,
          includeManualSeeds: options.candidateIncludeManualSeeds,
          themeRef: options.themeRef,
        }),
      ),
    );

    stages.push(
      await runStage(prisma, jobRun.jobRunId, "t1_exposure_purity", () =>
        scoreThemeExposure(prisma, {
          includeFmp: options.exposureIncludeFmp,
          includeSec: options.exposureIncludeSec,
          themeRef: options.themeRef,
        }),
      ),
    );

    if (options.includeDemand) {
      stages.push(
        await runStage(prisma, jobRun.jobRunId, "t2_demand_fetch", () =>
          fetchEconomicDemand(prisma, {
            provider: options.demandProvider,
            themeRef: options.themeRef,
          }),
        ),
      );
      stages.push(
        await runStage(prisma, jobRun.jobRunId, "t2_demand_score", () =>
          scoreEconomicDemandThemes(prisma, {
            themeRef: options.themeRef,
          }),
        ),
      );
    }

    stages.push(
      await runStage(prisma, jobRun.jobRunId, "t3_fundamentals", () =>
        scoreThemeFundamentals(prisma, {
          includeFmp: options.fundamentalsIncludeFmp,
          includeSec: options.fundamentalsIncludeSec,
          themeRef: options.themeRef,
        }),
      ),
    );

    stages.push(
      await runStage(prisma, jobRun.jobRunId, "t4_price", () =>
        scoreThemePrices(prisma, {
          includeFmp: options.priceIncludeFmp,
          includeMassive: options.priceIncludeMassive,
          themeRef: options.themeRef,
        }),
      ),
    );

    stages.push(
      await runStage(prisma, jobRun.jobRunId, "t6_liquidity_fragility", () =>
        scoreThemeLiquidity(prisma, {
          includeFmp: options.liquidityIncludeFmp,
          includeMassive: options.liquidityIncludeMassive,
          includeSec: options.liquidityIncludeSec,
          themeRef: options.themeRef,
        }),
      ),
    );

    stages.push(
      await runStage(prisma, jobRun.jobRunId, "t8_expression_decision", () =>
        scoreThemeExpressions(prisma, {
          themeRef: options.themeRef,
        }),
      ),
    );

    stages.push(
      await runStage(prisma, jobRun.jobRunId, "t11_theme_snapshot", () =>
        buildThemeSnapshots(prisma, {
          themeRef: options.themeRef,
        }),
      ),
    );

    stages.push(
      await runStage(prisma, jobRun.jobRunId, "t13_alert_generation", () =>
        evaluateAlerts(prisma, {
          themeRef: options.themeRef,
        }),
      ),
    );

    const status = finalStatus(stages);
    const totals = await finishParentJob(
      prisma,
      jobRun.jobRunId,
      stages,
      status,
    );

    return {
      jobRunId: jobRun.jobRunId,
      scopeId: scope,
      stages,
      status,
      ...totals,
    };
  } catch (error) {
    const totals = await finishParentJob(
      prisma,
      jobRun.jobRunId,
      stages,
      "FAILED",
      shortError(error),
    );
    throw Object.assign(
      error instanceof Error ? error : new Error(String(error)),
      {
        operationalSummary: {
          jobRunId: jobRun.jobRunId,
          scopeId: scope,
          stages,
          status: "FAILED" as JobStatus,
          ...totals,
        },
      },
    );
  } finally {
    await releaseLock(prisma, jobRun.jobRunId, lockKey);
  }
}

export async function runDemandRefreshOrchestration(
  prisma: PrismaClient,
  options: DemandRefreshOrchestrationOptions = {},
): Promise<OperationalRefreshSummary> {
  const scope = `${scopeId(options.themeRef)}:${options.provider ?? "all-providers"}`;
  const jobRun = await createParentJob(
    prisma,
    "ECONOMIC_DEMAND_REFRESH",
    "economic_demand_refresh",
    scope,
  );
  const lockKey = `economic_demand_refresh:${scope}`;
  const stages: OperationalStageSummary[] = [];

  try {
    await acquireLock(prisma, jobRun.jobRunId, lockKey);

    stages.push(
      await runStage(prisma, jobRun.jobRunId, "t2_demand_fetch", () =>
        fetchEconomicDemand(prisma, {
          provider: options.provider,
          themeRef: options.themeRef,
        }),
      ),
    );

    stages.push(
      await runStage(prisma, jobRun.jobRunId, "t2_demand_score", () =>
        scoreEconomicDemandThemes(prisma, {
          themeRef: options.themeRef,
        }),
      ),
    );

    if (options.includeSnapshots ?? true) {
      stages.push(
        await runStage(prisma, jobRun.jobRunId, "t11_theme_snapshot", () =>
          buildThemeSnapshots(prisma, {
            themeRef: options.themeRef,
          }),
        ),
      );
    }

    if (options.includeAlerts ?? true) {
      stages.push(
        await runStage(prisma, jobRun.jobRunId, "t13_alert_generation", () =>
          evaluateAlerts(prisma, {
            themeRef: options.themeRef,
          }),
        ),
      );
    }

    const status = finalStatus(stages);
    const totals = await finishParentJob(
      prisma,
      jobRun.jobRunId,
      stages,
      status,
    );

    return {
      jobRunId: jobRun.jobRunId,
      scopeId: scope,
      stages,
      status,
      ...totals,
    };
  } catch (error) {
    const totals = await finishParentJob(
      prisma,
      jobRun.jobRunId,
      stages,
      "FAILED",
      shortError(error),
    );
    throw Object.assign(
      error instanceof Error ? error : new Error(String(error)),
      {
        operationalSummary: {
          jobRunId: jobRun.jobRunId,
          scopeId: scope,
          stages,
          status: "FAILED" as JobStatus,
          ...totals,
        },
      },
    );
  } finally {
    await releaseLock(prisma, jobRun.jobRunId, lockKey);
  }
}
