import type { AlertSeverity, SignalLayer } from "@/generated/prisma/client";
import { ALERT_LOCK_TTL_MS, ALERT_STATE_TYPES } from "@/lib/alerts/constants";
import {
  buildAlertDecision,
  cooldownUntil,
  severityForState,
  severityIncreased,
  uniqueStrings,
} from "@/lib/alerts/engine";
import type {
  AlertDbClient,
  AlertEvaluationOptions,
  AlertEvaluationSummary,
  AlertThemeSummary,
  CurrentTrackedState,
} from "@/lib/alerts/types";
import { toJsonValue } from "@/lib/alerts/types";
import { T1_SIGNAL_LAYER } from "@/lib/exposure/constants";
import { T8_SIGNAL_LAYER } from "@/lib/expression/constants";
import { T3_SIGNAL_LAYER } from "@/lib/fundamentals/constants";
import { T6_SIGNAL_LAYER } from "@/lib/liquidity/constants";
import { T4_SIGNAL_LAYER } from "@/lib/price/constants";
import { ACTIVE_THEME_STATUSES } from "@/lib/snapshots/constants";
import { isUuid } from "@/lib/util/uuid";

const SIGNAL_LAYERS = [
  T1_SIGNAL_LAYER,
  T3_SIGNAL_LAYER,
  T4_SIGNAL_LAYER,
  T6_SIGNAL_LAYER,
  T8_SIGNAL_LAYER,
] as const;

type ThemeForAlerts = Awaited<ReturnType<typeof loadThemesForAlerts>>[number];
type CandidateForAlerts = ThemeForAlerts["candidates"][number];

function shortError(error: string | undefined) {
  if (!error) {
    return undefined;
  }

  return error.length > 180 ? `${error.slice(0, 177)}...` : error;
}

function scopeFromOptions(options: AlertEvaluationOptions) {
  return options.themeRef ?? "all-active";
}

function themeWhere(themeRef?: string) {
  if (!themeRef) {
    return {
      status: {
        in: [...ACTIVE_THEME_STATUSES],
      },
    };
  }

  return {
    OR: [
      ...(isUuid(themeRef) ? [{ themeId: themeRef }] : []),
      { sourceThemeCode: themeRef },
      { themeSlug: themeRef },
    ],
  };
}

function decimalNumber(value: unknown) {
  return value === null || value === undefined ? undefined : Number(value);
}

async function acquireLock(
  prisma: AlertDbClient,
  jobRunId: string,
  scope: string,
) {
  const lockKey = `alert_generation:${scope}`;
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
        expiresAt: new Date(now.getTime() + ALERT_LOCK_TTL_MS),
        jobRunId,
        lockKey,
        ownerId: "alert-generation-cli",
      },
    });
  } catch {
    throw new Error(`Alert generation is already running for ${scope}.`);
  }

  return lockKey;
}

async function releaseLock(
  prisma: AlertDbClient,
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

async function loadThemesForAlerts(
  prisma: AlertDbClient,
  options: AlertEvaluationOptions,
) {
  return prisma.themeDefinition.findMany({
    include: {
      candidates: {
        include: {
          security: {
            select: {
              canonicalTicker: true,
              companyName: true,
              securityId: true,
            },
          },
          signalScores: {
            orderBy: {
              computedAt: "desc",
            },
            where: {
              signalLayer: {
                in: [...SIGNAL_LAYERS],
              },
            },
          },
          signalStates: {
            orderBy: {
              computedAt: "desc",
            },
            where: {
              signalLayer: {
                in: [...SIGNAL_LAYERS],
              },
            },
          },
        },
      },
      snapshots: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      sourceThemeCode: "asc",
    },
    where: themeWhere(options.themeRef),
  });
}

function latestSignalState(
  candidate: CandidateForAlerts,
  signalLayer: (typeof SIGNAL_LAYERS)[number],
) {
  return candidate.signalStates.find(
    (state) => state.signalLayer === signalLayer,
  );
}

function latestSignalScore(
  candidate: CandidateForAlerts,
  signalLayer: (typeof SIGNAL_LAYERS)[number],
) {
  return candidate.signalScores.find(
    (score) => score.signalLayer === signalLayer,
  );
}

function signalReasonCodes(
  candidate: CandidateForAlerts,
  signalLayer: (typeof SIGNAL_LAYERS)[number],
) {
  return uniqueStrings([
    ...uniqueStrings(latestSignalState(candidate, signalLayer)?.reasonCodes),
    ...uniqueStrings(latestSignalScore(candidate, signalLayer)?.reasonCodes),
  ]);
}

function signalEvidenceIds(
  candidate: CandidateForAlerts,
  signalLayer: (typeof SIGNAL_LAYERS)[number],
) {
  return uniqueStrings([
    ...uniqueStrings(latestSignalState(candidate, signalLayer)?.evidenceIds),
    ...uniqueStrings(latestSignalScore(candidate, signalLayer)?.evidenceIds),
  ]);
}

function trackedCandidateState(input: {
  candidate: CandidateForAlerts;
  signalLayer: (typeof SIGNAL_LAYERS)[number];
  stateType: CurrentTrackedState["stateType"];
  theme: ThemeForAlerts;
}): CurrentTrackedState | null {
  const state = latestSignalState(input.candidate, input.signalLayer);

  if (!state?.state) {
    return null;
  }

  const reasonCodes = signalReasonCodes(input.candidate, input.signalLayer);
  const severity = severityForState({
    reasonCodes,
    state: state.state,
    stateType: input.stateType,
  });

  return {
    currentScore: decimalNumber(
      latestSignalScore(input.candidate, input.signalLayer)?.score,
    ),
    currentState: state.state,
    evidenceIds: signalEvidenceIds(input.candidate, input.signalLayer),
    reasonCodes,
    securityId: input.candidate.securityId,
    severity,
    sourceThemeCode: input.theme.sourceThemeCode,
    stateType: input.stateType,
    themeCandidateId: input.candidate.themeCandidateId,
    themeId: input.theme.themeId,
    themeName: input.theme.themeName,
    themeSlug: input.theme.themeSlug,
    ticker: input.candidate.security.canonicalTicker,
  };
}

function trackedFinalState(
  theme: ThemeForAlerts,
  candidate: CandidateForAlerts,
): CurrentTrackedState | null {
  const t8State = latestSignalState(candidate, T8_SIGNAL_LAYER);
  const currentState = candidate.finalState ?? t8State?.state;

  if (!currentState) {
    return null;
  }

  const reasonCodes = uniqueStrings([
    ...signalReasonCodes(candidate, T8_SIGNAL_LAYER),
    ...uniqueStrings(candidate.rejectionReasonCodes),
  ]);
  const severity = severityForState({
    reasonCodes,
    state: currentState,
    stateType: ALERT_STATE_TYPES.CANDIDATE_FINAL_STATE,
  });

  return {
    currentScore: decimalNumber(
      latestSignalScore(candidate, T8_SIGNAL_LAYER)?.score,
    ),
    currentState,
    evidenceIds: signalEvidenceIds(candidate, T8_SIGNAL_LAYER),
    reasonCodes,
    securityId: candidate.securityId,
    severity,
    sourceThemeCode: theme.sourceThemeCode,
    stateType: ALERT_STATE_TYPES.CANDIDATE_FINAL_STATE,
    themeCandidateId: candidate.themeCandidateId,
    themeId: theme.themeId,
    themeName: theme.themeName,
    themeSlug: theme.themeSlug,
    ticker: candidate.security.canonicalTicker,
  };
}

function trackedStatesForTheme(theme: ThemeForAlerts) {
  const states: CurrentTrackedState[] = [];
  const snapshot = theme.snapshots[0];

  if (snapshot) {
    const reasonCodes = uniqueStrings([
      ...uniqueStrings(snapshot.highlightReasonCodes),
      ...uniqueStrings(snapshot.cautionReasonCodes),
    ]);

    states.push({
      currentScore: decimalNumber(snapshot.themeRealityScore),
      currentState: snapshot.dashboardState,
      evidenceIds: [],
      reasonCodes,
      severity: severityForState({
        reasonCodes,
        state: snapshot.dashboardState,
        stateType: ALERT_STATE_TYPES.THEME_DASHBOARD_STATE,
      }),
      sourceThemeCode: theme.sourceThemeCode,
      stateType: ALERT_STATE_TYPES.THEME_DASHBOARD_STATE,
      themeId: theme.themeId,
      themeName: theme.themeName,
      themeSlug: theme.themeSlug,
    });
  }

  for (const candidate of theme.candidates) {
    for (const item of [
      {
        signalLayer: T1_SIGNAL_LAYER,
        stateType: ALERT_STATE_TYPES.CANDIDATE_EXPOSURE_STATE,
      },
      {
        signalLayer: T3_SIGNAL_LAYER,
        stateType: ALERT_STATE_TYPES.CANDIDATE_FUNDAMENTAL_STATE,
      },
      {
        signalLayer: T4_SIGNAL_LAYER,
        stateType: ALERT_STATE_TYPES.CANDIDATE_PRICE_STATE,
      },
      {
        signalLayer: T6_SIGNAL_LAYER,
        stateType: ALERT_STATE_TYPES.CANDIDATE_LIQUIDITY_STATE,
      },
    ] satisfies {
      signalLayer: SignalLayer;
      stateType: CurrentTrackedState["stateType"];
    }[]) {
      const current = trackedCandidateState({
        candidate,
        signalLayer: item.signalLayer as (typeof SIGNAL_LAYERS)[number],
        stateType: item.stateType,
        theme,
      });

      if (current) {
        states.push(current);
      }
    }

    const finalState = trackedFinalState(theme, candidate);

    if (finalState) {
      states.push(finalState);
    }
  }

  return states;
}

async function latestPriorState(
  prisma: AlertDbClient,
  current: CurrentTrackedState,
) {
  return prisma.signalState.findFirst({
    orderBy: [
      {
        stateChangedAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
    where: {
      securityId: current.securityId ?? null,
      stateType: current.stateType,
      themeCandidateId: current.themeCandidateId ?? null,
      themeId: current.themeId,
    },
  });
}

async function latestAlertForCooldown(
  prisma: AlertDbClient,
  current: CurrentTrackedState,
  alertType: string,
) {
  return prisma.alert.findFirst({
    include: {
      signalState: {
        select: {
          cooldownUntil: true,
          severity: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    where: {
      alertType,
      securityId: current.securityId ?? null,
      themeCandidateId: current.themeCandidateId ?? null,
      themeId: current.themeId,
    },
  });
}

function isSuppressedByCooldown(input: {
  currentSeverity: AlertSeverity;
  latestAlert: Awaited<ReturnType<typeof latestAlertForCooldown>>;
  now: Date;
}) {
  if (!input.latestAlert) {
    return false;
  }

  const activeCooldown =
    input.latestAlert.signalState?.cooldownUntil &&
    input.latestAlert.signalState.cooldownUntil > input.now;

  if (!activeCooldown) {
    return false;
  }

  return !severityIncreased(input.latestAlert.severity, input.currentSeverity);
}

function emptyThemeSummary(theme: ThemeForAlerts): AlertThemeSummary {
  return {
    alertsCreated: 0,
    baselinesCreated: 0,
    changesSuppressed: 0,
    sourceThemeCode: theme.sourceThemeCode,
    statesEvaluated: 0,
    themeId: theme.themeId,
    themeName: theme.themeName,
  };
}

async function writeStateAndOptionalAlert(input: {
  current: CurrentTrackedState;
  jobRunId: string;
  now: Date;
  prisma: AlertDbClient;
}) {
  const prior = await latestPriorState(input.prisma, input.current);

  if (!prior) {
    await input.prisma.signalState.create({
      data: {
        currentScore: input.current.currentScore,
        currentState: input.current.currentState,
        evidenceIds: toJsonValue(input.current.evidenceIds),
        jobRunId: input.jobRunId,
        previousState: null,
        reasonCodes: toJsonValue(input.current.reasonCodes),
        securityId: input.current.securityId,
        severity: input.current.severity,
        stateChangedAt: input.now,
        stateType: input.current.stateType,
        themeCandidateId: input.current.themeCandidateId,
        themeId: input.current.themeId,
      },
    });

    return {
      alertCreated: false,
      baselineCreated: true,
      rowsWritten: 1,
      signalStateWritten: true,
      suppressed: false,
    };
  }

  if (prior.currentState === input.current.currentState) {
    return {
      alertCreated: false,
      baselineCreated: false,
      rowsWritten: 0,
      signalStateWritten: false,
      suppressed: false,
    };
  }

  const decision = buildAlertDecision(input.current, prior.currentState);
  const latestAlert = await latestAlertForCooldown(
    input.prisma,
    input.current,
    decision.alertType,
  );
  const suppressed = isSuppressedByCooldown({
    currentSeverity: decision.severity,
    latestAlert,
    now: input.now,
  });
  const signalState = await input.prisma.signalState.create({
    data: {
      cooldownUntil: cooldownUntil(input.now),
      currentScore: input.current.currentScore,
      currentState: input.current.currentState,
      evidenceIds: toJsonValue(input.current.evidenceIds),
      jobRunId: input.jobRunId,
      previousScore: decimalNumber(prior.currentScore),
      previousState: prior.currentState,
      reasonCodes: toJsonValue([
        decision.alertReasonCode,
        ...input.current.reasonCodes,
      ]),
      securityId: input.current.securityId,
      severity: decision.severity,
      stateChangedAt: input.now,
      stateType: input.current.stateType,
      themeCandidateId: input.current.themeCandidateId,
      themeId: input.current.themeId,
    },
  });

  if (suppressed) {
    return {
      alertCreated: false,
      baselineCreated: false,
      rowsWritten: 1,
      signalStateWritten: true,
      suppressed: true,
    };
  }

  const alert = await input.prisma.alert.create({
    data: {
      alertType: decision.alertType,
      deliveryStatus: "STORED",
      message: decision.message,
      reasonCodes: toJsonValue([
        decision.alertReasonCode,
        ...input.current.reasonCodes,
      ]),
      securityId: input.current.securityId,
      severity: decision.severity,
      signalStateId: signalState.signalStateId,
      themeCandidateId: input.current.themeCandidateId,
      themeId: input.current.themeId,
      title: decision.title,
    },
  });

  await input.prisma.jobItem.create({
    data: {
      finishedAt: input.now,
      itemId: alert.alertId,
      itemType: "STATE_ALERT",
      jobRunId: input.jobRunId,
      startedAt: input.now,
      status: "SUCCEEDED",
    },
  });

  return {
    alertCreated: true,
    baselineCreated: false,
    rowsWritten: 3,
    signalStateWritten: true,
    suppressed: false,
  };
}

export async function evaluateAlerts(
  prisma: AlertDbClient,
  options: AlertEvaluationOptions = {},
): Promise<AlertEvaluationSummary> {
  const scope = scopeFromOptions(options);
  const jobRun = await prisma.jobRun.create({
    data: {
      jobType: "ALERT_GENERATION",
      scopeId: scope,
      scopeType: "state_alerts",
      status: "STARTED",
    },
  });
  let lockKey: string | undefined;

  const summary: AlertEvaluationSummary = {
    alertsCreated: 0,
    baselinesCreated: 0,
    changesSuppressed: 0,
    jobRunId: jobRun.jobRunId,
    rowsRead: 0,
    rowsWritten: 0,
    signalStatesWritten: 0,
    themes: [],
    warnings: [],
  };

  try {
    lockKey = await acquireLock(prisma, jobRun.jobRunId, scope);

    const themes = await loadThemesForAlerts(prisma, options);

    if (themes.length === 0) {
      throw new Error(
        options.themeRef
          ? `No theme found for ${options.themeRef}.`
          : "No active themes found for alert generation.",
      );
    }

    const now = new Date();

    for (const theme of themes) {
      const themeSummary = emptyThemeSummary(theme);
      const states = trackedStatesForTheme(theme);

      if (theme.snapshots.length === 0) {
        summary.warnings.push({
          code: "ALERT_THEME_SNAPSHOT_MISSING",
          message: `No theme snapshot is available for ${theme.sourceThemeCode ?? theme.themeName}.`,
          severity: "WARNING",
          themeCode: theme.sourceThemeCode,
        });
      }

      for (const state of states) {
        summary.rowsRead += 1;
        themeSummary.statesEvaluated += 1;

        const result = await writeStateAndOptionalAlert({
          current: state,
          jobRunId: jobRun.jobRunId,
          now,
          prisma,
        });

        summary.rowsWritten += result.rowsWritten;

        if (result.signalStateWritten) {
          summary.signalStatesWritten += 1;
        }

        if (result.baselineCreated) {
          summary.baselinesCreated += 1;
          themeSummary.baselinesCreated += 1;
        }

        if (result.alertCreated) {
          summary.alertsCreated += 1;
          themeSummary.alertsCreated += 1;
        }

        if (result.suppressed) {
          summary.changesSuppressed += 1;
          themeSummary.changesSuppressed += 1;
        }
      }

      summary.themes.push(themeSummary);
    }

    await prisma.jobRun.update({
      data: {
        errorSummary:
          summary.warnings.length > 0
            ? `${summary.warnings.length} alert generation warning(s)`
            : undefined,
        finishedAt: new Date(),
        rowsRead: summary.rowsRead,
        rowsWritten: summary.rowsWritten,
        status: summary.warnings.some(
          (warning) => warning.severity === "BLOCKER",
        )
          ? "PARTIAL"
          : "SUCCEEDED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    return summary;
  } catch (error) {
    await prisma.jobRun.update({
      data: {
        errorSummary: shortError(
          error instanceof Error
            ? error.message
            : "Unknown alert generation error",
        ),
        finishedAt: new Date(),
        rowsRead: summary.rowsRead,
        rowsWritten: summary.rowsWritten,
        status: "FAILED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    throw error;
  } finally {
    if (lockKey) {
      await releaseLock(prisma, jobRun.jobRunId, lockKey);
    }
  }
}
