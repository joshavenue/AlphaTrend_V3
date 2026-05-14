import type { JobStatus, PrismaClient } from "@/generated/prisma/client";

export const DEFAULT_PROVIDER_SMOKE_MAX_AGE_MINUTES = 180;

export type ProviderSmokeGateOptions = {
  maxAgeMinutes?: number;
};

export type ProviderSmokeGateRun = {
  errorSummary: string | null;
  finishedAt: Date | null;
  jobRunId: string;
  startedAt: Date;
  status: JobStatus;
};

export type ProviderSmokeGateResult = {
  ageMinutes?: number;
  jobRunId?: string;
  maxAgeMinutes: number;
  ok: boolean;
  reasonCode?: string;
  status?: JobStatus;
  summary: string;
};

function maxAge(options: ProviderSmokeGateOptions) {
  return options.maxAgeMinutes ?? DEFAULT_PROVIDER_SMOKE_MAX_AGE_MINUTES;
}

export function evaluateProviderSmokeGate(
  run: ProviderSmokeGateRun | null,
  now: Date,
  options: ProviderSmokeGateOptions = {},
): ProviderSmokeGateResult {
  const maxAgeMinutes = maxAge(options);

  if (!run) {
    return {
      maxAgeMinutes,
      ok: false,
      reasonCode: "PROVIDER_SMOKE_MISSING",
      summary: "No provider smoke job exists.",
    };
  }

  if (!run.finishedAt) {
    return {
      jobRunId: run.jobRunId,
      maxAgeMinutes,
      ok: false,
      reasonCode: "PROVIDER_SMOKE_NOT_FINISHED",
      status: run.status,
      summary: `Latest provider smoke job has not finished: ${run.jobRunId}.`,
    };
  }

  const ageMinutes = Math.max(
    0,
    Math.round((now.getTime() - run.finishedAt.getTime()) / 60_000),
  );

  if (ageMinutes > maxAgeMinutes) {
    return {
      ageMinutes,
      jobRunId: run.jobRunId,
      maxAgeMinutes,
      ok: false,
      reasonCode: "PROVIDER_SMOKE_STALE",
      status: run.status,
      summary: `Latest provider smoke job is stale: ${ageMinutes} minutes old.`,
    };
  }

  if (run.status !== "SUCCEEDED") {
    return {
      ageMinutes,
      jobRunId: run.jobRunId,
      maxAgeMinutes,
      ok: false,
      reasonCode: "PROVIDER_SMOKE_NOT_GREEN",
      status: run.status,
      summary:
        run.errorSummary ??
        `Latest provider smoke job is ${run.status}, not SUCCEEDED.`,
    };
  }

  return {
    ageMinutes,
    jobRunId: run.jobRunId,
    maxAgeMinutes,
    ok: true,
    status: run.status,
    summary: "Latest provider smoke job is fresh and green.",
  };
}

export async function checkProviderSmokeGate(
  prisma: PrismaClient,
  options: ProviderSmokeGateOptions = {},
) {
  const latestRun = await prisma.jobRun.findFirst({
    orderBy: {
      startedAt: "desc",
    },
    select: {
      errorSummary: true,
      finishedAt: true,
      jobRunId: true,
      startedAt: true,
      status: true,
    },
    where: {
      jobType: "PROVIDER_SMOKE",
    },
  });

  return evaluateProviderSmokeGate(latestRun, new Date(), options);
}
